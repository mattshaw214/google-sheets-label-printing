package macinstall

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

const testExtensionID = "agiabldkomibfhdfpdfmlfikhjcjbibn"

func TestTargetPathsStayInsideUserHome(t *testing.T) {
	paths, err := TargetPaths("/Users/tester")
	if err != nil {
		t.Fatal(err)
	}
	if paths.Helper != "/Users/tester/Library/Application Support/Pete's Garden/Zebra Helper/org.petesgarden.zebra" {
		t.Fatalf("unexpected helper path %q", paths.Helper)
	}
	if paths.Manifest != "/Users/tester/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.petesgarden.zebra.json" {
		t.Fatalf("unexpected manifest path %q", paths.Manifest)
	}
}

func TestTargetPathsRejectsUnsafeHome(t *testing.T) {
	for _, home := range []string{"", "relative/home"} {
		if _, err := TargetPaths(home); err == nil {
			t.Fatalf("TargetPaths(%q) unexpectedly succeeded", home)
		}
	}
}

func TestNativeManifestUsesAbsoluteHelperAndExactOrigin(t *testing.T) {
	payload, err := NativeManifest(
		"/Users/tester/Library/Application Support/Pete's Garden/Zebra Helper/org.petesgarden.zebra",
		testExtensionID,
	)
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Name           string   `json:"name"`
		Path           string   `json:"path"`
		Type           string   `json:"type"`
		AllowedOrigins []string `json:"allowed_origins"`
	}
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Name != "org.petesgarden.zebra" ||
		manifest.Type != "stdio" ||
		manifest.Path == "" ||
		!reflect.DeepEqual(manifest.AllowedOrigins, []string{
			"chrome-extension://agiabldkomibfhdfpdfmlfikhjcjbibn/",
		}) {
		t.Fatalf("unexpected manifest: %#v", manifest)
	}
}

func TestInstallAndUninstallAreScopedAndIdempotent(t *testing.T) {
	home := t.TempDir()
	source := filepath.Join(t.TempDir(), "helper")
	if err := os.WriteFile(source, []byte("helper-bytes"), 0o755); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := Install(source, home, testExtensionID); err != nil {
			t.Fatal(err)
		}
	}
	paths, _ := TargetPaths(home)
	if info, err := os.Stat(paths.Helper); err != nil || info.Mode().Perm() != 0o755 {
		t.Fatalf("helper permissions: %v %v", info, err)
	}
	if payload, err := os.ReadFile(paths.Helper); err != nil || string(payload) != "helper-bytes" {
		t.Fatalf("installed helper: %q %v", payload, err)
	}
	if err := Uninstall(home); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(paths.Helper); !os.IsNotExist(err) {
		t.Fatalf("helper remains after uninstall: %v", err)
	}
	if _, err := os.Stat(paths.Manifest); !os.IsNotExist(err) {
		t.Fatalf("manifest remains after uninstall: %v", err)
	}
	if err := Uninstall(home); err != nil {
		t.Fatalf("second uninstall failed: %v", err)
	}
}
