param(
  [ValidateSet("list","read","write")][string]$Action = "list",
  [string]$Data = ""
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Threading;

public static class PcscNfc {
  [StructLayout(LayoutKind.Sequential)]
  public struct SCARD_IO_REQUEST {
    public UInt32 dwProtocol;
    public UInt32 cbPciLength;
  }

  [DllImport("winscard.dll")]
  static extern int SCardEstablishContext(UInt32 dwScope, IntPtr pvReserved1, IntPtr pvReserved2, out IntPtr phContext);

  [DllImport("winscard.dll", CharSet=CharSet.Unicode)]
  static extern int SCardListReaders(IntPtr hContext, string mszGroups, IntPtr mszReaders, ref UInt32 pcchReaders);

  [DllImport("winscard.dll", CharSet=CharSet.Unicode)]
  static extern int SCardListReaders(IntPtr hContext, string mszGroups, StringBuilder mszReaders, ref UInt32 pcchReaders);

  [DllImport("winscard.dll", CharSet=CharSet.Unicode)]
  static extern int SCardConnect(IntPtr hContext, string szReader, UInt32 dwShareMode, UInt32 dwPreferredProtocols, out IntPtr phCard, out UInt32 pdwActiveProtocol);

  [DllImport("winscard.dll")]
  static extern int SCardDisconnect(IntPtr hCard, UInt32 dwDisposition);

  [DllImport("winscard.dll")]
  static extern int SCardReleaseContext(IntPtr hContext);

  [DllImport("winscard.dll")]
  static extern int SCardTransmit(IntPtr hCard, ref SCARD_IO_REQUEST pioSendPci, byte[] pbSendBuffer, UInt32 cbSendLength, IntPtr pioRecvPci, byte[] pbRecvBuffer, ref UInt32 pcbRecvLength);

  const UInt32 SCARD_SCOPE_USER = 0;
  const UInt32 SCARD_SHARE_SHARED = 2;
  const UInt32 SCARD_PROTOCOL_T0 = 1;
  const UInt32 SCARD_PROTOCOL_T1 = 2;`r`n  const UInt32 SCARD_PROTOCOL_RAW = 4;
  const UInt32 SCARD_LEAVE_CARD = 0;

  static void Check(int code, string step) {
    if (code != 0) throw new Exception(step + " failed: 0x" + code.ToString("X8"));
  }

  public static string[] ListReaders() {
    IntPtr ctx;
    Check(SCardEstablishContext(SCARD_SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out ctx), "SCardEstablishContext");
    try {
      UInt32 len = 0;
      int rc = SCardListReaders(ctx, null, IntPtr.Zero, ref len);
      Check(rc, "SCardListReaders length");
      var sb = new StringBuilder((int)len);
      Check(SCardListReaders(ctx, null, sb, ref len), "SCardListReaders");
      return sb.ToString().Split(new char[] {'\0'}, StringSplitOptions.RemoveEmptyEntries);
    } finally {
      SCardReleaseContext(ctx);
    }
  }

  static byte[] Tx(IntPtr card, UInt32 proto, byte[] apdu) {
    var sendPci = new SCARD_IO_REQUEST { dwProtocol = proto, cbPciLength = 8 };
    byte[] recv = new byte[258];
    UInt32 recvLen = (UInt32)recv.Length;
    Check(SCardTransmit(card, ref sendPci, apdu, (UInt32)apdu.Length, IntPtr.Zero, recv, ref recvLen), "SCardTransmit");
    byte[] result = new byte[recvLen];
    Array.Copy(recv, result, recvLen);
    if (result.Length < 2 || result[result.Length - 2] != 0x90 || result[result.Length - 1] != 0x00) {
      throw new Exception("APDU failed: " + BitConverter.ToString(result));
    }
    byte[] data = new byte[result.Length - 2];
    Array.Copy(result, data, data.Length);
    return data;
  }


  static IntPtr ConnectWithWait(IntPtr ctx, string reader, out UInt32 proto, string step) {
    IntPtr card;
    int last = 0;
    for (int attempt = 0; attempt < 50; attempt++) {
      last = SCardConnect(ctx, reader, SCARD_SHARE_SHARED, SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1 | SCARD_PROTOCOL_RAW, out card, out proto);
      if (last == 0) return card;
      Thread.Sleep(200);
    }
    proto = 0;
    throw new Exception(step + " failed: 0x" + last.ToString("X8") + " - Tag wurde nicht stabil erkannt. Tag mittig auflegen und liegen lassen.");
  }
  static string Hex(byte[] bytes) {
    return BitConverter.ToString(bytes).Replace("-", "");
  }

  static string CleanData(byte[] bytes) {
    for (int i = 0; i + 5 < bytes.Length; i++) {
      if (bytes[i] == 0x03 && bytes[i + 2] == 0xD1 && bytes[i + 3] == 0x01 && bytes[i + 5] == 0x55) {
        int recordLen = bytes[i + 1];
        int payloadLen = bytes[i + 4];
        int payloadStart = i + 6;
        if (recordLen >= 5 && payloadLen >= 1 && payloadStart + payloadLen <= bytes.Length) {
          byte prefixCode = bytes[payloadStart];
          string prefix = prefixCode == 0x03 ? "http://" : (prefixCode == 0x04 ? "https://" : "");
          return prefix + Encoding.ASCII.GetString(bytes, payloadStart + 1, payloadLen - 1).Trim();
        }
      }
    }
    string ascii = Encoding.ASCII.GetString(bytes);
    int http = ascii.IndexOf("http://", StringComparison.OrdinalIgnoreCase);
    if (http < 0) http = ascii.IndexOf("https://", StringComparison.OrdinalIgnoreCase);
    if (http >= 0) {
      int end = http;
      while (end < bytes.Length && bytes[end] != 0x00 && bytes[end] != 0xFE) end++;
      return ascii.Substring(http, Math.Max(0, end - http)).Trim();
    }
    int start = ascii.IndexOf("PPP:", StringComparison.OrdinalIgnoreCase);
    if (start < 0) start = 0;
    int stop = start;
    while (stop < bytes.Length && bytes[stop] != 0x00 && bytes[stop] != 0xFE) stop++;
    return ascii.Substring(start, Math.Max(0, stop - start)).Trim();
  }

  static byte[] BuildUrlNdef(string url) {
    string prefix = "";
    byte prefixCode = 0x00;
    if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) { prefix = "http://"; prefixCode = 0x03; }
    else if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) { prefix = "https://"; prefixCode = 0x04; }
    byte[] uri = Encoding.ASCII.GetBytes(url.Substring(prefix.Length));
    int payloadLen = uri.Length + 1;
    if (payloadLen > 255) throw new Exception("URL ist zu lang fuer NFC-Tag.");
    var bytes = new List<byte>();
    bytes.Add(0x03);
    bytes.Add((byte)(payloadLen + 4));
    bytes.Add(0xD1);
    bytes.Add(0x01);
    bytes.Add((byte)payloadLen);
    bytes.Add(0x55);
    bytes.Add(prefixCode);
    bytes.AddRange(uri);
    bytes.Add(0xFE);
    while (bytes.Count % 4 != 0) bytes.Add(0x00);
    return bytes.ToArray();
  }

  public static Dictionary<string,string> ReadTag() {
    IntPtr ctx;
    Check(SCardEstablishContext(SCARD_SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out ctx), "SCardEstablishContext");
    IntPtr card = IntPtr.Zero;
    try {
      var readers = ListReaders();
      if (readers.Length == 0) throw new Exception("Kein PC/SC NFC Reader gefunden.");
      UInt32 proto;
      card = ConnectWithWait(ctx, readers[0], out proto, "SCardConnect - liegt ein NFC Tag auf dem Reader?");
      byte[] uid = Tx(card, proto, new byte[] {0xFF,0xCA,0x00,0x00,0x00});
      var all = new List<byte>();
      for (byte page = 4; page < 40; page++) {
        try { all.AddRange(Tx(card, proto, new byte[] {0xFF,0xB0,0x00,page,0x04})); }
        catch { break; }
      }
      return new Dictionary<string,string> { {"reader", readers[0]}, {"uid", Hex(uid)}, {"data", CleanData(all.ToArray())} };
    } finally {
      if (card != IntPtr.Zero) SCardDisconnect(card, SCARD_LEAVE_CARD);
      SCardReleaseContext(ctx);
    }
  }

  public static Dictionary<string,string> WriteTag(string payload) {
    if (String.IsNullOrWhiteSpace(payload)) throw new Exception("Leerer NFC Payload.");
    payload = payload.Trim();
    byte[] writeBytes;
    if (payload.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || payload.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) {
      writeBytes = BuildUrlNdef(payload);
    } else {
      if (!payload.StartsWith("PPP:")) payload = "PPP:" + payload.Trim();
      byte[] bytes = Encoding.ASCII.GetBytes(payload);
      if (bytes.Length > 80) throw new Exception("Payload zu lang fuer sicheren Testbereich.");
      var textBytes = new List<byte>(bytes);
      textBytes.Add(0x00);
      while (textBytes.Count % 4 != 0) textBytes.Add(0x00);
      writeBytes = textBytes.ToArray();
    }

    IntPtr ctx;
    Check(SCardEstablishContext(SCARD_SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out ctx), "SCardEstablishContext");
    IntPtr card = IntPtr.Zero;
    try {
      var readers = ListReaders();
      if (readers.Length == 0) throw new Exception("Kein PC/SC NFC Reader gefunden.");
      UInt32 proto;
      card = ConnectWithWait(ctx, readers[0], out proto, "SCardConnect - Tag auflegen");
      byte[] uid = Tx(card, proto, new byte[] {0xFF,0xCA,0x00,0x00,0x00});
      for (byte page = 4; page < 40; page++) Tx(card, proto, new byte[] {0xFF,0xD6,0x00,page,0x04,0x00,0x00,0x00,0x00});
      for (int offset = 0; offset < writeBytes.Length; offset += 4) {
        byte page = (byte)(4 + offset / 4);
        Tx(card, proto, new byte[] {0xFF,0xD6,0x00,page,0x04,writeBytes[offset],writeBytes[offset+1],writeBytes[offset+2],writeBytes[offset+3]});
      }
      return new Dictionary<string,string> { {"reader", readers[0]}, {"uid", Hex(uid)}, {"data", payload} };
    } finally {
      if (card != IntPtr.Zero) SCardDisconnect(card, SCARD_LEAVE_CARD);
      SCardReleaseContext(ctx);
    }
  }
}
"@

try {
  if ($Action -eq "list") {
    [pscustomobject]@{ ok = $true; readers = [PcscNfc]::ListReaders() } | ConvertTo-Json -Depth 5 -Compress
  } elseif ($Action -eq "read") {
    $r = [PcscNfc]::ReadTag()
    [pscustomobject]@{ ok = $true; reader = $r.reader; uid = $r.uid; data = $r.data } | ConvertTo-Json -Depth 5 -Compress
  } else {
    $r = [PcscNfc]::WriteTag($Data)
    [pscustomobject]@{ ok = $true; reader = $r.reader; uid = $r.uid; data = $r.data } | ConvertTo-Json -Depth 5 -Compress
  }
} catch {
  [pscustomobject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Depth 5 -Compress
  exit 1
}


