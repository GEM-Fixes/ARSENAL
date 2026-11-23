# uidrive window helper. acts on one process's main window only: refuses input unless that window is in front.
# usage: win.ps1 -ProcName call_to_arms -Op info|shot|click|dclick|rclick|key|move [-X n -Y n] [-Key name] [-Out file.png]
# Author: Imperator_Aug (ARSENAL, ia-e772ab2b)
param([string]$ProcName, [string]$Op, [int]$X = 0, [int]$Y = 0, [string]$Key = '', [string]$Out = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class U32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy, data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public short vk, scan; public int flags, time; public IntPtr extra; public int pad1, pad2; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT m; [FieldOffset(0)] public KEYBDINPUT k; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public int type; public UNION u; }
  [DllImport("user32")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32")] public static extern void keybd_event(byte vk, byte scan, int flags, IntPtr extra);
  [DllImport("user32")] public static extern int MapVirtualKey(int code, int type);
  [DllImport("user32")] public static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32")] public static extern bool SetProcessDPIAware();
  [DllImport("user32")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  // built here: powershell copies nested structs, field writes from script are lost
  public static uint Mouse(int flags) { INPUT i = new INPUT(); i.type = 0; i.u.m.flags = flags; return SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT))); }
  public static uint Wheel(int delta) { INPUT i = new INPUT(); i.type = 0; i.u.m.flags = 0x0800; i.u.m.data = delta; return SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT))); }
  public static uint Key(int scan, int flags) { INPUT i = new INPUT(); i.type = 1; i.u.k.scan = (short)scan; i.u.k.flags = flags; return SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT))); }
}
'@
[void][U32]::SetProcessDPIAware()
$p = Get-Process -Name $ProcName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output '{"ok":false,"why":"no window"}'; exit 3 }
$h = $p.MainWindowHandle
$r = New-Object U32+RECT; [void][U32]::GetClientRect($h, [ref]$r)
$o = New-Object U32+POINT; [void][U32]::ClientToScreen($h, [ref]$o)
$w = $r.R - $r.L; $ht = $r.B - $r.T
function Front {
  if ([U32]::GetForegroundWindow() -eq $h) { return $true }
  # alt tap lets a background process take the foreground
  [U32]::keybd_event(0x12, 0, 0, [IntPtr]::Zero); [U32]::keybd_event(0x12, 0, 2, [IntPtr]::Zero)
  [void][U32]::ShowWindow($h, 9); [void][U32]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 300
  return ([U32]::GetForegroundWindow() -eq $h)
}
function Mouse([int]$flags) {
  if ([U32]::Mouse($flags) -ne 1) { Write-Output '{"ok":false,"why":"SendInput refused"}'; exit 7 }
}
function Tap([int]$vk) {
  $sc = [U32]::MapVirtualKey($vk, 0)
  foreach ($fl in 8, 10) {  # 8 = scancode, 2 = keyup: games read scancodes
    if ([U32]::Key($sc, $fl) -ne 1) { Write-Output '{"ok":false,"why":"SendInput refused"}'; exit 7 }
    Start-Sleep -Milliseconds 40
  }
}
switch ($Op) {
  'info' { Write-Output (@{ ok = $true; pid = $p.Id; w = $w; h = $ht; x = $o.X; y = $o.Y; front = ([U32]::GetForegroundWindow() -eq $h) } | ConvertTo-Json -Compress) }
  'shot' {
    if (-not (Front)) { Write-Output '{"ok":false,"why":"not front"}'; exit 4 }
    Start-Sleep -Milliseconds 150
    $b = New-Object Drawing.Bitmap $w, $ht
    $g = [Drawing.Graphics]::FromImage($b); $g.CopyFromScreen($o.X, $o.Y, 0, 0, $b.Size); $g.Dispose()
    $b.Save($Out, [Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
    Write-Output (@{ ok = $true; w = $w; h = $ht; out = $Out } | ConvertTo-Json -Compress)
  }
  { $_ -in 'click', 'dclick', 'rclick', 'move', 'wheel' } {
    if ($X -lt 0 -or $Y -lt 0 -or $X -ge $w -or $Y -ge $ht) { Write-Output '{"ok":false,"why":"outside window"}'; exit 5 }
    if (-not (Front)) { Write-Output '{"ok":false,"why":"not front"}'; exit 4 }
    # another window on top (firewall prompt, Steam overlay window) must never get the click
    $pt = New-Object U32+POINT; $pt.X = $o.X + $X; $pt.Y = $o.Y + $Y
    if ([U32]::GetAncestor([U32]::WindowFromPoint($pt), 2) -ne $h) { Write-Output '{"ok":false,"why":"other window at point"}'; exit 8 }
    [void][U32]::SetCursorPos($o.X + $X, $o.Y + $Y); Start-Sleep -Milliseconds 120
    if ($Op -eq 'wheel') {  # -Key = notches, negative scrolls down
      if ([U32]::Wheel(120 * [int]$Key) -ne 1) { Write-Output '{"ok":false,"why":"SendInput refused"}'; exit 7 }
    } elseif ($Op -eq 'rclick') {
      Mouse 8; Start-Sleep -Milliseconds 120; Mouse 16
    } elseif ($Op -ne 'move') {
      Mouse 2; Start-Sleep -Milliseconds 120; Mouse 4
      if ($Op -eq 'dclick') { Start-Sleep -Milliseconds 90; Mouse 2; Start-Sleep -Milliseconds 50; Mouse 4 }
    }
    Write-Output '{"ok":true}'
  }
  'key' {
    if (-not (Front)) { Write-Output '{"ok":false,"why":"not front"}'; exit 4 }
    $map = @{ esc = 0x1B; enter = 0x0D; space = 0x20; tab = 0x09; tilde = 0xC0; f1 = 0x70; f10 = 0x79; pause = 0x13 }
    if (-not $map.ContainsKey($Key)) { Write-Output '{"ok":false,"why":"unknown key"}'; exit 6 }
    Tap $map[$Key]
    Write-Output '{"ok":true}'
  }
  default { Write-Output '{"ok":false,"why":"unknown op"}'; exit 2 }
}
