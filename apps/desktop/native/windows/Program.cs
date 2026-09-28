using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Automation;

namespace BotBound.Native;

internal record Bounds(int X, int Y, int Width, int Height);
internal record WindowInfo(string Id, string Title, string AppName, int ProcessId, Bounds Bounds, double ScaleFactor);

internal static class Program
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly HashSet<string> BlockedApps = new(StringComparer.OrdinalIgnoreCase)
    {
        "consent", "logonui", "credentialuibroker", "lsass", "lockapp", "systemsettings", "regedit", "mmc",
        "cmd", "powershell", "pwsh", "windowsterminal", "wt", "conhost", "wscript", "cscript"
    };
    private static readonly Dictionary<string, ushort> Keys = new(StringComparer.Ordinal)
    {
        ["CTRL"] = 0x11, ["ALT"] = 0x12, ["SHIFT"] = 0x10, ["ENTER"] = 0x0D, ["TAB"] = 0x09,
        ["ESC"] = 0x1B, ["BACKSPACE"] = 0x08, ["DELETE"] = 0x2E, ["SPACE"] = 0x20,
        ["UP"] = 0x26, ["DOWN"] = 0x28, ["LEFT"] = 0x25, ["RIGHT"] = 0x27,
        ["HOME"] = 0x24, ["END"] = 0x23, ["PAGEUP"] = 0x21, ["PAGEDOWN"] = 0x22
    };
    private static bool inputStarted;

    [STAThread]
    private static int Main()
    {
        Console.InputEncoding = new UTF8Encoding(false, true);
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            var chars = new char[65537];
            var length = 0;
            int read;
            while (length < chars.Length && (read = Console.In.Read(chars, length, chars.Length - length)) > 0) length += read;
            if (length == chars.Length) return Reply(new { status = "rejected" });
            using var document = JsonDocument.Parse(new string(chars, 0, length), new JsonDocumentOptions { MaxDepth = 12 });
            var request = document.RootElement;
            if (!request.TryGetProperty("version", out var version) || version.GetInt32() != 1) return Reply(new { status = "rejected" });
            var operation = request.GetProperty("operation").GetString();
            if (operation == "commit_workspace")
                return Reply(new { status = WorkspacePersistence.Commit(request) ? "committed" : "rejected" });
            if (!OnInteractiveDesktop()) return Reply(new { status = "rejected" });
            if (operation == "release")
            {
                var releaseAction = request.GetProperty("action");
                if (!ValidAction(releaseAction, new Bounds(0, 0, 16384, 16384))) return Reply(new { status = "rejected" });
                return Reply(new { status = Send(ReleaseInputs(releaseAction)) ? "applied" : "unknown" });
            }
            if (operation == "list") return Reply(new { status = "ok", windows = ListWindows() });
            if (operation != "inspect" && operation != "activate" && operation != "execute") return Reply(new { status = "rejected" });
            var id = request.GetProperty("windowId").GetString() ?? "";
            var window = ResolveWindow(id);
            if (window is null) return Reply(new { status = "rejected" });
            if (operation == "inspect")
            {
                if (FocusedPasswordField(window.ProcessId)) return Reply(new { status = "rejected" });
                return Reply(new { status = "ok", window, foreground = Native.GetForegroundWindow() == ParseHandle(id) });
            }
            var expected = request.GetProperty("expectedWindow").Deserialize<WindowInfo>(new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (expected != window) return Reply(new { status = "rejected" });
            var handle = ParseHandle(id);
            if (operation == "activate")
            {
                if (FocusedPasswordField(window.ProcessId)) return Reply(new { status = "rejected" });
                if (Native.GetForegroundWindow() != handle && !Native.SetForegroundWindow(handle)) return Reply(new { status = "rejected" });
                for (var i = 0; i < 8 && Native.GetForegroundWindow() != handle; i++) Thread.Sleep(25);
                return Reply(new { status = OnInteractiveDesktop() && Native.GetForegroundWindow() == handle && ResolveWindow(id) == expected ? "ok" : "rejected" });
            }
            // Activation belongs before the adapter's final capture. Never refocus here.
            var action = request.GetProperty("action");
            if (!ValidAction(action, window.Bounds)) return Reply(new { status = "rejected" });
            if (!OnInteractiveDesktop() || Native.GetForegroundWindow() != handle || ResolveWindow(id) != expected ||
                new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }.Any(key => (Native.GetAsyncKeyState(key) & 0x8000) != 0)) return Reply(new { status = "rejected" });

            var type = action.GetProperty("type").GetString();
            if (type == "click" || type == "scroll")
            {
                var x = checked(window.Bounds.X + action.GetProperty("x").GetInt32());
                var y = checked(window.Bounds.Y + action.GetProperty("y").GetInt32());
                if (Native.GetAncestor(Native.WindowFromPoint(new Native.POINT(x, y)), 2) != handle || SensitiveElementAt(x, y, window.ProcessId)) return Reply(new { status = "rejected" });
                inputStarted = true;
                if (!Native.SetCursorPos(x, y)) return Reply(new { status = "unknown" });
                if (Native.GetForegroundWindow() != handle || Native.GetAncestor(Native.WindowFromPoint(new Native.POINT(x, y)), 2) != handle) return Reply(new { status = "unknown" });
                if (type == "click")
                {
                    var right = action.GetProperty("button").GetString() == "right";
                    var count = action.GetProperty("clickCount").GetInt32();
                    var events = new List<Native.INPUT>();
                    for (var i = 0; i < count; i++) { events.Add(Mouse(right ? 0x0008u : 0x0002u)); events.Add(Mouse(right ? 0x0010u : 0x0004u)); }
                    return Reply(new { status = SendWithRelease(events, action) ? "applied" : "unknown" });
                }
                // The public API is pixel-oriented. Windows wheel messages are 120-unit detents;
                // approximate 100 requested pixels per detent, with a strict bounded number.
                var dx = action.GetProperty("deltaX").GetInt32();
                var dy = action.GetProperty("deltaY").GetInt32();
                var scroll = new List<Native.INPUT>();
                if (dx != 0) scroll.Add(Mouse(0x1000, Wheel(dx)));
                if (dy != 0) scroll.Add(Mouse(0x0800, -Wheel(dy)));
                return Reply(new { status = Send(scroll) ? "applied" : "unknown" });
            }
            if (!SafeFocusedElement(window.ProcessId, handle)) return Reply(new { status = "rejected" });
            var inputs = new List<Native.INPUT>();
            if (type == "type_text")
            {
                foreach (var character in action.GetProperty("text").GetString()!)
                {
                    inputs.Add(Keyboard(0, character, 0x0004));
                    inputs.Add(Keyboard(0, character, 0x0004 | 0x0002));
                }
            }
            else
            {
                var pressed = action.GetProperty("keys").EnumerateArray().Select(key => VirtualKey(key.GetString()!)).ToArray();
                foreach (var key in pressed) inputs.Add(Keyboard(key, 0, 0));
                foreach (var key in pressed.Reverse()) inputs.Add(Keyboard(key, 0, 0x0002));
            }
            if (Native.GetForegroundWindow() != handle || ResolveWindow(id) != expected) return Reply(new { status = "rejected" });
            inputStarted = true;
            var sent = SendWithRelease(inputs, action);
            return Reply(new { status = sent ? "applied" : "unknown" });
        }
        catch { return Reply(new { status = inputStarted ? "unknown" : "rejected" }); }
    }

    private static int Reply(object value) { Console.Write(JsonSerializer.Serialize(value, Json)); return 0; }
    private static IntPtr ParseHandle(string id) => new(checked((long)ulong.Parse(id.Split(':')[0], CultureInfo.InvariantCulture)));
    private static WindowInfo? ResolveWindow(string id)
    {
        if (id.Length > 64 || !System.Text.RegularExpressions.Regex.IsMatch(id, @"^\d{1,20}:\d{1,10}:\d{1,20}$")) return null;
        var current = InspectWindow(ParseHandle(id));
        return current?.Id == id ? current : null;
    }
    private static List<WindowInfo> ListWindows()
    {
        var output = new List<WindowInfo>();
        Native.EnumWindows((handle, _) => { var window = InspectWindow(handle); if (window is not null) output.Add(window); return output.Count < 200; }, IntPtr.Zero);
        return output;
    }
    private static WindowInfo? InspectWindow(IntPtr handle)
    {
        try
        {
            if (!Native.IsWindow(handle) || !Native.IsWindowVisible(handle) || Native.IsIconic(handle)) return null;
            Native.GetWindowThreadProcessId(handle, out var processId);
            using var process = Process.GetProcessById(checked((int)processId));
            if (BlockedApps.Contains(process.ProcessName) || IsElevated(process.Handle)) return null;
            if (Native.DwmGetWindowAttribute(handle, 14, out int cloaked, sizeof(int)) == 0 && cloaked != 0) return null;
            var title = new StringBuilder(501);
            Native.GetWindowText(handle, title, title.Capacity);
            if (title.Length == 0) return null;
            if (!Native.GetWindowRect(handle, out var rect)) return null;
            // DWM extended-frame bounds exclude invisible resize borders and match captured frames.
            if (Native.DwmGetWindowAttributeRect(handle, 9, out var visible, Marshal.SizeOf<Native.RECT>()) == 0) rect = visible;
            var width = rect.Right - rect.Left; var height = rect.Bottom - rect.Top;
            if (width <= 0 || height <= 0 || width > 16384 || height > 16384 || Math.Abs((long)rect.Left) > 100000 || Math.Abs((long)rect.Top) > 100000) return null;
            var start = process.StartTime.ToUniversalTime().Ticks;
            var id = $"{handle.ToInt64()}:{processId}:{start}";
            var dpi = Native.GetDpiForWindow(handle);
            return new WindowInfo(id, title.ToString(), process.ProcessName, checked((int)processId), new Bounds(rect.Left, rect.Top, width, height), dpi == 0 ? 1 : dpi / 96.0);
        }
        catch { return null; }
    }
    private static bool IsElevated(IntPtr process)
    {
        if (!Native.OpenProcessToken(process, 0x0008, out var token)) return true;
        try { return !Native.GetTokenInformation(token, 20, out int elevation, sizeof(int), out _) || elevation != 0; }
        finally { Native.CloseHandle(token); }
    }
    private static bool OnInteractiveDesktop()
    {
        var desktop = Native.OpenInputDesktop(0, false, 0x0001);
        if (desktop == IntPtr.Zero) return false;
        try
        {
            var name = new StringBuilder(256);
            return Native.GetUserObjectInformation(desktop, 2, name, name.Capacity * 2, out _) && name.ToString() == "Default";
        }
        finally { Native.CloseDesktop(desktop); }
    }
    private static bool FocusedPasswordField(int processId)
    {
        try { var element = AutomationElement.FocusedElement; return element is not null && element.Current.ProcessId == processId && element.Current.IsPassword; }
        catch { return true; }
    }
    private static bool SensitiveElementAt(int x, int y, int processId)
    {
        try { var element = AutomationElement.FromPoint(new System.Windows.Point(x, y)); return element is null || element.Current.ProcessId != processId || element.Current.IsPassword; }
        catch { return true; }
    }
    private static bool SafeFocusedElement(int processId, IntPtr handle)
    {
        try
        {
            var element = AutomationElement.FocusedElement;
            if (element is null || element.Current.ProcessId != processId || element.Current.IsPassword || !element.Current.IsEnabled) return false;
            var current = element;
            for (var i = 0; i < 64 && current is not null; i++, current = TreeWalker.ControlViewWalker.GetParent(current))
                if (current.Current.NativeWindowHandle != 0 && new IntPtr(current.Current.NativeWindowHandle) == handle) return true;
            return false;
        }
        catch { return false; }
    }
    private static bool ExactKeys(JsonElement element, params string[] names) => element.ValueKind == JsonValueKind.Object && element.EnumerateObject().Count() == names.Length && names.All(name => element.TryGetProperty(name, out _));
    private static bool Int(JsonElement element, string key, int min, int max) => element.TryGetProperty(key, out var value) && value.TryGetInt32(out var number) && number >= min && number <= max;
    private static bool ValidAction(JsonElement action, Bounds bounds)
    {
        if (!action.TryGetProperty("type", out var typeElement)) return false;
        var type = typeElement.GetString();
        if (type == "click" || type == "scroll")
        {
            if (!Int(action, "x", 0, bounds.Width - 1) || !Int(action, "y", 0, bounds.Height - 1)) return false;
            if (type == "click") return ExactKeys(action, "type", "x", "y", "button", "clickCount") &&
                (action.GetProperty("button").GetString() is "left" or "right") && Int(action, "clickCount", 1, 2);
            return ExactKeys(action, "type", "x", "y", "deltaX", "deltaY") && Int(action, "deltaX", -2000, 2000) && Int(action, "deltaY", -2000, 2000) && (action.GetProperty("deltaX").GetInt32() != 0 || action.GetProperty("deltaY").GetInt32() != 0);
        }
        if (type == "type_text")
        {
            if (!ExactKeys(action, "type", "text")) return false;
            var value = action.GetProperty("text").GetString();
            return value is { Length: > 0 and <= 2000 } && value.All(character => character == '\n' || !char.IsControl(character)) &&
                !System.Text.RegularExpressions.Regex.IsMatch(value, @"^[\s\uFEFF]*(?:javascript|vbscript|data|file|shell|powershell|cmd|ms-[a-z0-9-]+):", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        }
        if (type != "keypress" || !ExactKeys(action, "type", "keys")) return false;
        var keys = action.GetProperty("keys").EnumerateArray().Select(key => key.GetString() ?? "").ToArray();
        if (keys.Length is < 1 or > 4 || keys.Distinct().Count() != keys.Length || keys.Any(key => VirtualKey(key) == 0)) return false;
        var modifiers = new[] { "CTRL", "ALT", "SHIFT" };
        return keys.Count(key => !modifiers.Contains(key)) == 1 && keys.Take(keys.Length - 1).All(modifiers.Contains) &&
            !(keys.Contains("ALT") && (keys.Contains("TAB") || keys.Contains("SPACE"))) &&
            !(keys.Contains("ESC") && keys.Any(modifiers.Contains)) &&
            !(keys.Contains("CTRL") && keys.Contains("ALT") && keys.Contains("DELETE"));
    }
    private static ushort VirtualKey(string key) => Keys.TryGetValue(key, out var value) ? value : key.Length == 1 && (key[0] is >= 'A' and <= 'Z' or >= '0' and <= '9') ? key[0] : (ushort)0;
    private static int Wheel(int value) => Math.Sign(value) * Math.Min(10, (int)Math.Ceiling(Math.Abs(value) / 100.0)) * 120;
    private static Native.INPUT Keyboard(ushort key, ushort scan, uint flags) => new() { Type = 1, Union = new Native.INPUTUNION { Keyboard = new Native.KEYBDINPUT { VirtualKey = key, Scan = scan, Flags = flags } } };
    private static Native.INPUT Mouse(uint flags, int data = 0) => new() { Type = 0, Union = new Native.INPUTUNION { Mouse = new Native.MOUSEINPUT { Flags = flags, MouseData = unchecked((uint)data) } } };
    private static IEnumerable<Native.INPUT> ReleaseInputs(JsonElement action)
    {
        var type = action.GetProperty("type").GetString();
        if (type == "click") return new[] { Mouse(action.GetProperty("button").GetString() == "right" ? 0x0010u : 0x0004u) };
        if (type == "keypress") return action.GetProperty("keys").EnumerateArray().Reverse().Select(key => Keyboard(VirtualKey(key.GetString()!), 0, 2)).ToArray();
        if (type == "type_text") return action.GetProperty("text").GetString()!.Distinct().Select(character => Keyboard(0, character, 0x0004 | 0x0002)).ToArray();
        return Array.Empty<Native.INPUT>();
    }
    private static bool SendWithRelease(IEnumerable<Native.INPUT> values, JsonElement action)
    {
        var complete = false;
        try { complete = Send(values); return complete; }
        finally { if (!complete) Send(ReleaseInputs(action)); }
    }
    private static bool Send(IEnumerable<Native.INPUT> values) { var inputs = values.ToArray(); return inputs.Length == 0 || Native.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Native.INPUT>()) == inputs.Length; }
}

internal static class Native
{
    internal delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] internal struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] internal readonly record struct POINT(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] internal struct INPUT { public uint Type; public INPUTUNION Union; }
    [StructLayout(LayoutKind.Explicit)] internal struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT Mouse; [FieldOffset(0)] public KEYBDINPUT Keyboard; }
    [StructLayout(LayoutKind.Sequential)] internal struct MOUSEINPUT { public int X, Y; public uint MouseData, Flags, Time; public UIntPtr ExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] internal struct KEYBDINPUT { public ushort VirtualKey, Scan; public uint Flags, Time; public UIntPtr ExtraInfo; }
    [DllImport("user32.dll")] internal static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] internal static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] internal static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] internal static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] internal static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] internal static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", SetLastError = true)] internal static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll", SetLastError = true)] internal static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] internal static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder info, int length, out int required);
    [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
    [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] internal static extern int DwmGetWindowAttributeRect(IntPtr hwnd, int attribute, out RECT value, int size);
    [DllImport("advapi32.dll", SetLastError = true)] internal static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] internal static extern bool GetTokenInformation(IntPtr token, int tokenClass, out int info, int length, out int required);
    [DllImport("kernel32.dll")] internal static extern bool CloseHandle(IntPtr handle);
}
