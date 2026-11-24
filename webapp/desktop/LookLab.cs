using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("LookLab")]
[assembly: AssemblyProduct("Nostalgia OM-3 LookLab")]
[assembly: AssemblyDescription("OM-3 暗房工作台")]

internal static class LookLab
{
    [STAThread]
    private static int Main()
    {
        try
        {
            string local = Environment.GetEnvironmentVariable("LOCALAPPDATA")
                ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string root = Path.Combine(local, "Nostalgia-OM", "LookLab");
            string edge = FindEdge(local);
            Directory.CreateDirectory(root);
            string page = Path.Combine(root, "index.html");
            using (var mutex = new Mutex(false, @"Local\NostalgiaOM.LookLab.InstallPage"))
            {
                try { mutex.WaitOne(); }
                catch (AbandonedMutexException) { /* The previous launch was interrupted. */ }
                try { InstallPage(page); }
                finally { mutex.ReleaseMutex(); }
            }

            var start = new ProcessStartInfo(edge) {
                UseShellExecute = false,
                Arguments = "--no-first-run --no-default-browser-check --user-data-dir=\"" +
                    Path.Combine(root, "Profile") + "\" --app=\"" + new Uri(page).AbsoluteUri + "\""
            };
            using (Process browser = Process.Start(start)) { }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "LookLab", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string FindEdge(string local)
    {
        foreach (string folder in new[] {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), local })
        {
            if (String.IsNullOrEmpty(folder)) continue;
            string path = Path.Combine(folder, "Microsoft", "Edge", "Application", "msedge.exe");
            if (File.Exists(path)) return path;
        }
        throw new FileNotFoundException("LookLab 需要 Microsoft Edge。安装 Edge 后再打开工作台。");
    }

    private static void InstallPage(string page)
    {
        Assembly app = Assembly.GetExecutingAssembly();
        // The resource name is the SHA-256 of the uncompressed page.
        const string prefix = "workbench.";
        string resource = Array.Find(app.GetManifestResourceNames(), name => name.StartsWith(prefix));
        string expected = resource.Substring(prefix.Length);
        if (File.Exists(page))
        {
            using (var hash = SHA256.Create())
            using (var existing = File.OpenRead(page))
            {
                string actual = BitConverter.ToString(hash.ComputeHash(existing)).Replace("-", "");
                if (String.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)) return;
            }
        }
        string temporary = page + ".new";
        try
        {
            using (Stream payload = app.GetManifestResourceStream(resource))
            using (var gzip = new GZipStream(payload, CompressionMode.Decompress))
            using (var output = File.Create(temporary)) gzip.CopyTo(output);
            if (File.Exists(page)) File.Replace(temporary, page, null);
            else File.Move(temporary, page);
        }
        finally { File.Delete(temporary); }
    }
}
