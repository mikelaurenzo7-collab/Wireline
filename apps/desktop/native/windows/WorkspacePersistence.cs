using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace BotBound.Native;

// Called only by the companion's store, before any UI/accessibility code.
// No arbitrary destination, contents, shell command or copy/delete fallback.
internal static class WorkspacePersistence
{
    [DllImport("kernel32.dll", EntryPoint = "MoveFileExW", ExactSpelling = true, CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MoveFileExW(string source, string target, uint flags);

    internal static bool Commit(JsonElement request)
    {
        if (request.EnumerateObject().Count() != 4 ||
            !request.TryGetProperty("directory", out var directoryValue) ||
            !request.TryGetProperty("temporaryBasename", out var temporaryValue)) return false;
        var directory = directoryValue.GetString();
        var temporary = temporaryValue.GetString();
        if (directory is null || directory.Length > 4096 || !Path.IsPathFullyQualified(directory) ||
            directory.StartsWith(@"\\", StringComparison.Ordinal) || directory.Any(char.IsControl) ||
            temporary is null || !Regex.IsMatch(temporary, @"\Aworkspace-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp\z")) return false;
        directory = Path.GetFullPath(directory);
        // Network/removable storage and redirected directory links have unverified guarantees.
        if (new DriveInfo(Path.GetPathRoot(directory)!).DriveType != DriveType.Fixed) return false;
        for (var ancestor = new DirectoryInfo(directory); ancestor is not null; ancestor = ancestor.Parent)
            if (!ancestor.Exists || ancestor.Attributes.HasFlag(FileAttributes.ReparsePoint)) return false;
        var source = Path.Combine(directory, temporary);
        var target = Path.Combine(directory, "workspace.enc");
        var sourceInfo = new FileInfo(source);
        if (!sourceInfo.Exists || sourceInfo.Length > 32 * 1024 * 1024 ||
            (sourceInfo.Attributes & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) return false;
        if (File.Exists(target) && (File.GetAttributes(target) & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) return false;
        using (var file = new FileStream(source, FileMode.Open, FileAccess.ReadWrite, FileShare.Read))
            file.Flush(flushToDisk: true);
        // https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-movefileexw
        // WRITE_THROUGH returns only after the move reaches disk. COPY_ALLOWED is absent:
        // both fixed basenames are in the same directory; failure must never degrade to copy/delete.
        return MoveFileExW(source, target, 0x1 /* REPLACE_EXISTING */ | 0x8 /* WRITE_THROUGH */);
    }
}
