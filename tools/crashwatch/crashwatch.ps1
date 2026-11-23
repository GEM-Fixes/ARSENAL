# crashwatch: attach as debugger to a running game, log hard faults the game's own handler never sees.
# use: powershell -ExecutionPolicy Bypass -File tools/crashwatch/crashwatch.ps1 -Inst 3 -Out out.txt [-Wait 120]
#   [-Game as64|mowas2|mowas_2|goh] [-Exe <exe file name>] [-Pid N] [-Plan]
#   -Game: the game; sets the default -Exe (as64.exe, mowas_2.exe, call_to_arms.exe) and, for mowas2 and goh, -Inst 0
#   -Exe: process name to watch (default as64.exe; a path keeps its file name)
#   -Inst N (N >= 1): the process whose command line has "-instance N" (AS64's numbered instances, the old behaviour)
#   -Inst 0: any process named -Exe (the newest). mowas_2.exe has no -instance (TST-19) and GoH has none either: use -Inst 0 or -Pid;
#     -Inst N >= 1 with mowas_2.exe or call_to_arms.exe is refused with one plain line, exit 2
#   -Pid N: that process (its name must be -Exe when -Exe or -Game is given)
#   -Plan: find the process, print what would be watched (pid, exe, pdb or not) on stdout and in -Out, attach nothing, exit 0
# Read only: passes every exception on to the game. Symbols come from the pdb beside the exe when present; with none (mowas_2 and
#   GoH ship none) the output says so on its first line and lists addresses (rva) only. The AS64 default (-Inst N >= 1, no -Game,
#   no -Pid) writes no note line: its output is as before.
# exit 0 run ended / plan written, 2 no such process, attach failed, or refused.
# Author: Imperator_Aug (ARSENAL, ia-f4a8307d)
param([int]$Inst = 1, [string]$Out = "crashwatch.txt", [int]$Wait = 120, [string]$Exe = "as64.exe", [string]$Game = "", [Alias("Pid")][int]$ProcId = 0, [switch]$Plan)
$games = @{ 'as64' = @('as64.exe', 'AS64'); 'mowas2' = @('mowas_2.exe', 'MoW:AS2'); 'mowas_2' = @('mowas_2.exe', 'MoW:AS2'); 'goh' = @('call_to_arms.exe', 'GoH') }
if ($Game) {
  $g = $games[$Game.ToLower()]
  if (-not $g) { [Console]::Error.WriteLine("crashwatch: -Game needs as64, mowas2, mowas_2 or goh"); exit 2 }
  if (-not $PSBoundParameters.ContainsKey('Exe')) { $Exe = $g[0] }
  if (-not $PSBoundParameters.ContainsKey('Inst') -and $g[0] -ne 'as64.exe') { $Inst = 0 }
}
$Exe = [IO.Path]::GetFileName($Exe)
$name = @{ 'mowas_2.exe' = 'MoW:AS2'; 'call_to_arms.exe' = 'GoH' }[$Exe.ToLower()]
if ($Inst -ge 1 -and -not $ProcId -and $name) {
  $why = @{ 'MoW:AS2' = 'mowas_2.exe has no -instance, so no process carries "-instance N"; use -Inst 0 (any mowas_2.exe) or -Pid (TST-19)'; 'GoH' = 'call_to_arms.exe has no numbered instances; use -Inst 0 (any call_to_arms.exe) or -Pid (modweb/testing/goh-drive)' }[$name]
  [Console]::Error.WriteLine("crashwatch: not available for $($name): $why"); exit 2
}
$src = @'
using System; using System.IO; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class CW {
  [DllImport("kernel32",SetLastError=true)] static extern bool DebugActiveProcess(int pid);
  [DllImport("kernel32",SetLastError=true)] static extern bool DebugSetProcessKillOnExit(bool k);
  [DllImport("kernel32",SetLastError=true)] static extern bool WaitForDebugEvent(IntPtr ev, int ms);
  [DllImport("kernel32",SetLastError=true)] static extern bool ContinueDebugEvent(int pid, int tid, uint status);
  [DllImport("kernel32",SetLastError=true)] static extern bool GetThreadContext(IntPtr t, IntPtr ctx);
  [DllImport("kernel32",SetLastError=true)] static extern bool ReadProcessMemory(IntPtr p, IntPtr a, byte[] b, IntPtr n, out IntPtr r);
  [DllImport("kernel32",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("ntdll")] static extern int NtQueryInformationThread(IntPtr t, int c, byte[] b, int n, IntPtr r);
  [DllImport("dbghelp",SetLastError=true)] static extern uint SymSetOptions(uint o);
  [DllImport("dbghelp",SetLastError=true,CharSet=CharSet.Ansi)] static extern bool SymInitialize(IntPtr p, string path, bool invade);
  [DllImport("dbghelp",SetLastError=true,CharSet=CharSet.Ansi)] static extern ulong SymLoadModuleEx(IntPtr p, IntPtr f, string img, string mod, ulong b, uint sz, IntPtr d, uint fl);
  [DllImport("dbghelp",SetLastError=true)] static extern bool SymFromAddr(IntPtr p, ulong a, out ulong disp, IntPtr info);
  const uint CONT = 0x00010002, NOTH = 0x80010001;
  static IntPtr hProc = IntPtr.Zero, hSym = new IntPtr(0x1234); static ulong imgBase = 0; static bool sym = false; static string image;
  static Dictionary<int,IntPtr> th = new Dictionary<int,IntPtr>();
  static StreamWriter w;
  static void L(string s) { w.WriteLine(DateTime.Now.ToString("HH:mm:ss.fff") + " " + s); w.Flush(); }
  static string S(ulong a) {
    if (!sym) return "";
    IntPtr b = Marshal.AllocHGlobal(1024); for (int i = 0; i < 1024; i++) Marshal.WriteByte(b, i, 0);
    Marshal.WriteInt32(b, 0, 88); Marshal.WriteInt32(b, 80, 600); ulong d; string r = "";
    if (SymFromAddr(hSym, a, out d, b)) r = Marshal.PtrToStringAnsi(new IntPtr(b.ToInt64() + 84)) + "+0x" + d.ToString("x");
    Marshal.FreeHGlobal(b); return r;
  }
  static byte[] Rd(ulong a, int n) { byte[] b = new byte[n]; IntPtr r; if (!ReadProcessMemory(hProc, new IntPtr((long)a), b, new IntPtr(n), out r)) return null; return b; }
  static void Report(int tid, uint code, ulong addr, ulong kind, ulong target, int first) {
    if (!sym && imgBase != 0) {
      SymSetOptions(0x2 | 0x10); // undname, load lines
      sym = SymInitialize(hSym, Path.GetDirectoryName(image), false);
      if (sym) { ulong m = SymLoadModuleEx(hSym, IntPtr.Zero, image, null, imgBase, 0, IntPtr.Zero, 0); L("symbols " + (m != 0 ? "loaded" : "failed")); }
    }
    L("EXC code=0x" + code.ToString("X8") + " first=" + first + " tid=" + tid + " at=0x" + addr.ToString("x") + " rva=0x" + (addr - imgBase).ToString("x") + " " + S(addr) + " kind=" + kind + " target=0x" + target.ToString("x"));
    IntPtr h; if (!th.TryGetValue(tid, out h)) { L(" no thread handle"); return; }
    IntPtr raw = Marshal.AllocHGlobal(1232 + 16); long al = (raw.ToInt64() + 15) & ~15L; IntPtr ctx = new IntPtr(al);
    for (int i = 0; i < 1232; i++) Marshal.WriteByte(ctx, i, 0);
    Marshal.WriteInt32(ctx, 0x30, 0x100003);
    if (GetThreadContext(h, ctx)) {
      ulong rsp = (ulong)Marshal.ReadInt64(ctx, 0x98), rip = (ulong)Marshal.ReadInt64(ctx, 0xF8);
      byte[] tbi = new byte[48]; ulong sb = 0, sl = 0;
      if (NtQueryInformationThread(h, 0, tbi, 48, IntPtr.Zero) == 0) { ulong teb = BitConverter.ToUInt64(tbi, 8); byte[] t = Rd(teb + 8, 16); if (t != null) { sb = BitConverter.ToUInt64(t, 0); sl = BitConverter.ToUInt64(t, 8); } }
      L(" rip=0x" + rip.ToString("x") + " rsp=0x" + rsp.ToString("x") + " stackBase=0x" + sb.ToString("x") + " stackLimit=0x" + sl.ToString("x") + " used=" + (sb > rsp ? (sb - rsp) : 0) + " left=" + (rsp > sl ? (rsp - sl) : 0));
      ulong end = sb > rsp ? sb : rsp + 0x1000; byte[] st = Rd(rsp, (int)(end - rsp));
      if (st != null) {
        string prev = null; int run = 0, shown = 0; ulong top = imgBase + 0x10000000;
        var hist = new Dictionary<string,int>();
        for (int i = 0; i + 8 <= st.Length; i += 8) {
          ulong q = BitConverter.ToUInt64(st, i); if (q < imgBase || q > top) continue;
          string n = S(q); if (n == "" ) continue; string nm = n.Split('+')[0]; int hc; hist.TryGetValue(nm, out hc); hist[nm] = hc + 1;
          if (nm == prev) { run++; continue; }
          if (run > 0 && shown < 90) L("   ...x" + (run + 1)); run = 0; prev = nm; shown++;
          if (shown < 90) L("  [+" + i.ToString("x") + "] " + n);
        }
        var hl = new List<KeyValuePair<string,int>>(hist); hl.Sort((x, y) => y.Value - x.Value);
        for (int i = 0; i < hl.Count && i < 30; i++) L(" hist " + hl[i].Value + " " + hl[i].Key);
      }
    } else L(" GetThreadContext failed " + Marshal.GetLastWin32Error());
    Marshal.FreeHGlobal(raw);
  }
  public static int Run(int pid, string exePath, string outFile, string note) {
    image = exePath; w = new StreamWriter(outFile, false, new UTF8Encoding(false));
    if (!string.IsNullOrEmpty(note)) L(note);
    if (!DebugActiveProcess(pid)) { L("attach failed " + Marshal.GetLastWin32Error()); w.Close(); return 2; }
    DebugSetProcessKillOnExit(false); L("attached pid " + pid);
    IntPtr ev = Marshal.AllocHGlobal(256); int hard = 0; var seen = new Dictionary<uint,int>();
    while (true) {
      if (!WaitForDebugEvent(ev, 2000)) continue;
      int code = Marshal.ReadInt32(ev, 0), p = Marshal.ReadInt32(ev, 4), t = Marshal.ReadInt32(ev, 8); uint cont = CONT;
      if (code == 3) { IntPtr f = Marshal.ReadIntPtr(ev, 16); hProc = Marshal.ReadIntPtr(ev, 24); th[t] = Marshal.ReadIntPtr(ev, 32); imgBase = (ulong)Marshal.ReadInt64(ev, 40); if (f != IntPtr.Zero) CloseHandle(f); L("base=0x" + imgBase.ToString("x")); }
      else if (code == 2) { th[t] = Marshal.ReadIntPtr(ev, 16); }
      else if (code == 4) { th.Remove(t); }
      else if (code == 6) { IntPtr f = Marshal.ReadIntPtr(ev, 16); if (f != IntPtr.Zero) CloseHandle(f); }
      else if (code == 5) { L("EXIT code=0x" + ((uint)Marshal.ReadInt32(ev, 16)).ToString("X8")); ContinueDebugEvent(p, t, CONT); break; }
      else if (code == 1) {
        uint ec = (uint)Marshal.ReadInt32(ev, 16); ulong ad = (ulong)Marshal.ReadInt64(ev, 32); int np = Marshal.ReadInt32(ev, 40); int first = Marshal.ReadInt32(ev, 168);
        ulong i0 = np > 0 ? (ulong)Marshal.ReadInt64(ev, 48) : 0, i1 = np > 1 ? (ulong)Marshal.ReadInt64(ev, 56) : 0;
        int c; seen.TryGetValue(ec, out c); seen[ec] = c + 1;
        bool isBreak = ec == 0x80000003 || ec == 0x4000001F || ec == 0x406D1388; // thread name: only raised for a debugger, which must absorb it
        if (isBreak) cont = CONT; else cont = NOTH;
        bool bad = (ec & 0xF0000000) == 0xC0000000 || (first == 0 && !isBreak);
        if (bad && hard < 40) { hard++; Report(t, ec, ad, i0, i1, first); }
      }
      ContinueDebugEvent(p, t, cont);
    }
    foreach (var kv in seen) L("count 0x" + kv.Key.ToString("X8") + " " + kv.Value);
    w.Close(); return 0;
  }
}
'@
$deadline = (Get-Date).AddSeconds($Wait); $proc = $null
$named = $PSBoundParameters.ContainsKey('Exe') -or $Game
while (-not $proc -and (Get-Date) -lt $deadline) {
  if ($ProcId) { $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcId" | Where-Object { -not $named -or $_.Name -ieq $Exe } | Select-Object -First 1 }
  elseif ($Inst -ge 1) { $proc = Get-CimInstance Win32_Process -Filter "Name='$Exe'" | Where-Object { $_.CommandLine -match "-instance $Inst(\s|$)" } | Select-Object -First 1 }
  else { $proc = Get-CimInstance Win32_Process -Filter "Name='$Exe'" | Sort-Object CreationDate -Descending | Select-Object -First 1 }
  if (-not $proc) { Start-Sleep -Milliseconds 500 }
}
if (-not $proc) {
  $what = if ($ProcId) { "no process $ProcId" + $(if ($named) { " named $Exe" } else { '' }) } elseif ($Inst -ge 1) { "no $Exe with -instance $Inst" } else { "no $Exe running" }
  "$what in $Wait s" | Out-File -Encoding utf8 $Out; exit 2
}
$img = $proc.ExecutablePath
$pdb = if ($img) { [IO.Path]::ChangeExtension($img, '.pdb') } else { $null }
$sym = if ($pdb -and (Test-Path -LiteralPath $pdb)) { "symbols from " + [IO.Path]::GetFileName($pdb) } else { "no pdb beside " + $(if ($img) { [IO.Path]::GetFileName($img) } else { $Exe }) + ": addresses (rva) only, no function names (mowas_2 and GoH ship no pdb)" }
if ($Plan) {
  $line = "plan: would watch pid " + $proc.ProcessId + " (" + $proc.Name + ")" + $(if ($Inst -ge 1 -and -not $ProcId) { " -instance $Inst" } else { '' }) + "; $sym"
  $line; [IO.File]::WriteAllLines($Out, [string[]]@($line), (New-Object System.Text.UTF8Encoding($false))); exit 0
}
Add-Type -TypeDefinition $src -Language CSharp
# the note is the first line CW writes, before any address; the AS64 default (-Inst N >= 1, no -Game, no -Pid) writes none, as before
$asOld = -not $Game -and -not $ProcId -and $Inst -ge 1
$r = [CW]::Run([int]$proc.ProcessId, $img, $Out, $(if ($asOld) { $null } else { "note: $sym" }))
exit $r
