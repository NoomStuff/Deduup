// What the shared splash.cs needs to know about this app. Everything else in the
// splash is the same in AcroClip, AttaCut and Deduup.
using System.Drawing;

internal static class Identity
{
    internal const string Name = "Deduup";
    internal const string Slug = "deduup";
    // electron-builder's product executable becomes the launcher; Electron runs as this.
    internal const string RuntimeExe = "Deduup-app.exe";
    internal const string SignalVariable = "DEDUUP_SPLASH_SIGNAL";
    internal static readonly Color Background = Color.FromArgb(19, 19, 19);
    internal static readonly Color Border = Color.FromArgb(44, 44, 44);
    internal static readonly Color Accent = Color.FromArgb(201, 138, 90);
    // Arguments that run a command instead of opening the app, so they skip the splash.
    internal static readonly string[] QuietArguments = new string[] {  };
}
