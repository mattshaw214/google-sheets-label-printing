package install

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFileAtomicReplacesDestinationWithoutLeavingTemporaryFile(t *testing.T) {
	directory := t.TempDir()
	destination := filepath.Join(directory, "helper.exe")
	if err := os.WriteFile(destination, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := writeFileAtomic(destination, []byte("new helper"), 0o700); err != nil {
		t.Fatalf("writeFileAtomic() error = %v", err)
	}
	got, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "new helper" {
		t.Fatalf("destination = %q", got)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "helper.exe" {
		t.Fatalf("directory entries = %#v", entries)
	}
}

func TestWriteFileAtomicDoesNotCreateMissingParent(t *testing.T) {
	destination := filepath.Join(t.TempDir(), "missing", "helper.exe")
	if err := writeFileAtomic(destination, []byte("helper"), 0o700); err == nil {
		t.Fatal("writeFileAtomic() succeeded with missing parent")
	}
}
