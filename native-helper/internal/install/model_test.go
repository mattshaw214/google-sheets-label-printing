package install

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

const sampleExtensionID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func TestTargetPathsStayUnderLocalAppData(t *testing.T) {
	paths, err := TargetPaths(`C:\Users\Pete\AppData\Local`)
	if err != nil {
		t.Fatalf("TargetPaths() error = %v", err)
	}
	if got, want := paths.Dir, `C:\Users\Pete\AppData\Local\Pete's Garden\Zebra Helper`; got != want {
		t.Fatalf("Dir = %q, want %q", got, want)
	}
	if got, want := paths.Helper, paths.Dir+`\org.petesgarden.zebra.exe`; got != want {
		t.Fatalf("Helper = %q, want %q", got, want)
	}
	if got, want := paths.Manifest, paths.Dir+`\org.petesgarden.zebra.json`; got != want {
		t.Fatalf("Manifest = %q, want %q", got, want)
	}
	if got, want := paths.Uninstaller, paths.Dir+`\Uninstall.exe`; got != want {
		t.Fatalf("Uninstaller = %q, want %q", got, want)
	}
}

func TestTargetPathsRejectBlankLocalAppData(t *testing.T) {
	if _, err := TargetPaths("  "); err == nil {
		t.Fatal("TargetPaths(blank) succeeded")
	}
}

func TestNativeManifestUsesRelativeHostAndOnlyExactOrigin(t *testing.T) {
	payload, err := NativeManifest(sampleExtensionID)
	if err != nil {
		t.Fatalf("NativeManifest() error = %v", err)
	}
	var manifest struct {
		Name           string   `json:"name"`
		Description    string   `json:"description"`
		Path           string   `json:"path"`
		Type           string   `json:"type"`
		AllowedOrigins []string `json:"allowed_origins"`
	}
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("manifest JSON: %v", err)
	}
	if manifest.Name != NativeHostName || manifest.Type != "stdio" {
		t.Fatalf("manifest = %+v", manifest)
	}
	if manifest.Path != HelperFileName || strings.ContainsAny(manifest.Path, `\/:`) {
		t.Fatalf("manifest path = %q, want relative executable name", manifest.Path)
	}
	wantOrigins := []string{"chrome-extension://" + sampleExtensionID + "/"}
	if !reflect.DeepEqual(manifest.AllowedOrigins, wantOrigins) {
		t.Fatalf("allowed_origins = %#v, want %#v", manifest.AllowedOrigins, wantOrigins)
	}
}

func TestNativeManifestRejectsInvalidExtensionID(t *testing.T) {
	if _, err := NativeManifest("not-an-extension-id"); err == nil {
		t.Fatal("NativeManifest(invalid ID) succeeded")
	}
}

func TestInstallRegistryCommandsUseOnlyHKCUAndExactValues(t *testing.T) {
	paths, _ := TargetPaths(`C:\Users\Pete\AppData\Local`)
	commands := InstallRegistryCommands(paths)
	if len(commands) < 7 {
		t.Fatalf("InstallRegistryCommands() returned %d commands", len(commands))
	}
	wantNative := []string{"ADD", NativeRegistryKey, "/ve", "/t", "REG_SZ", "/d", paths.Manifest, "/f"}
	if !reflect.DeepEqual(commands[0], wantNative) {
		t.Fatalf("native host reg args = %#v, want %#v", commands[0], wantNative)
	}
	joined := strings.Join(flatten(commands), " ")
	if strings.Contains(strings.ToUpper(joined), "HKLM") || strings.Contains(strings.ToUpper(joined), "HKEY_LOCAL_MACHINE") {
		t.Fatalf("registry plan includes admin hive: %s", joined)
	}
	for _, expected := range []string{"DisplayName", ProductName, "DisplayVersion", ProductVersion, "InstallLocation", paths.Dir, "UninstallString", `"` + paths.Uninstaller + `" /uninstall`, "NoModify", "NoRepair"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("registry plan missing %q: %s", expected, joined)
		}
	}
}

func TestUninstallRegistryCommandsDeleteOnlyProductKeys(t *testing.T) {
	want := [][]string{
		{"DELETE", NativeRegistryKey, "/f"},
		{"DELETE", ARPRegistryKey, "/f"},
	}
	if got := UninstallRegistryCommands(); !reflect.DeepEqual(got, want) {
		t.Fatalf("UninstallRegistryCommands() = %#v, want %#v", got, want)
	}
}

func TestCleanupCommandSchedulesTargetDirectoryDeletion(t *testing.T) {
	directory := `C:\Users\Pete\AppData\Local\Pete's Garden\Zebra Helper`
	executable, args, err := CleanupCommand(directory)
	if err != nil {
		t.Fatalf("CleanupCommand() error = %v", err)
	}
	if executable != "cmd.exe" {
		t.Fatalf("cleanup executable = %q", executable)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "rmdir") || !strings.Contains(joined, directory) || !strings.Contains(joined, "ping") {
		t.Fatalf("cleanup args do not schedule delayed deletion: %#v", args)
	}
}

func TestCleanupCommandRejectsShellMetacharacters(t *testing.T) {
	for _, directory := range []string{"", `C:\safe & whoami`, `C:\safe%TEMP%`, `C:\safe|bad`, `C:\safe>bad`, "C:\\safe\nbad"} {
		if _, _, err := CleanupCommand(directory); err == nil {
			t.Fatalf("CleanupCommand(%q) succeeded", directory)
		}
	}
}

func flatten(commands [][]string) []string {
	var result []string
	for _, command := range commands {
		result = append(result, command...)
	}
	return result
}
