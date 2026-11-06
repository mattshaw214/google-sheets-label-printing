package macinstall

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"petesgarden/windowshelper/internal/host"
)

const (
	NativeHostName = "org.petesgarden.zebra"
	ProductName    = "Pete's Garden Zebra Helper"
)

type Paths struct {
	Dir      string
	Helper   string
	Manifest string
}

func TargetPaths(home string) (Paths, error) {
	if strings.TrimSpace(home) == "" || !filepath.IsAbs(home) {
		return Paths{}, fmt.Errorf("user home directory must be an absolute path")
	}
	cleanHome := filepath.Clean(home)
	helperDir := filepath.Join(
		cleanHome,
		"Library",
		"Application Support",
		"Pete's Garden",
		"Zebra Helper",
	)
	return Paths{
		Dir:    helperDir,
		Helper: filepath.Join(helperDir, NativeHostName),
		Manifest: filepath.Join(
			cleanHome,
			"Library",
			"Application Support",
			"Google",
			"Chrome",
			"NativeMessagingHosts",
			NativeHostName+".json",
		),
	}, nil
}

func NativeManifest(helperPath, extensionID string) ([]byte, error) {
	if !filepath.IsAbs(helperPath) {
		return nil, fmt.Errorf("helper path must be absolute")
	}
	origin, err := host.OriginFromExtensionID(extensionID)
	if err != nil {
		return nil, err
	}
	manifest := struct {
		Name           string   `json:"name"`
		Description    string   `json:"description"`
		Path           string   `json:"path"`
		Type           string   `json:"type"`
		AllowedOrigins []string `json:"allowed_origins"`
	}{
		Name:           NativeHostName,
		Description:    ProductName,
		Path:           helperPath,
		Type:           "stdio",
		AllowedOrigins: []string{origin},
	}
	payload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode native manifest: %w", err)
	}
	return append(payload, '\n'), nil
}

func Install(sourceExecutable, home, extensionID string) (Paths, error) {
	if !filepath.IsAbs(sourceExecutable) {
		return Paths{}, fmt.Errorf("source executable path must be absolute")
	}
	paths, err := TargetPaths(home)
	if err != nil {
		return Paths{}, err
	}
	manifest, err := NativeManifest(paths.Helper, extensionID)
	if err != nil {
		return Paths{}, err
	}
	if err := os.MkdirAll(paths.Dir, 0o755); err != nil {
		return Paths{}, fmt.Errorf("create helper directory: %w", err)
	}
	if err := copyAtomic(sourceExecutable, paths.Helper, 0o755); err != nil {
		return Paths{}, err
	}
	if err := os.MkdirAll(filepath.Dir(paths.Manifest), 0o755); err != nil {
		return Paths{}, fmt.Errorf("create Chrome manifest directory: %w", err)
	}
	if err := writeAtomic(paths.Manifest, manifest, 0o644); err != nil {
		return Paths{}, err
	}
	return paths, nil
}

func Uninstall(home string) error {
	paths, err := TargetPaths(home)
	if err != nil {
		return err
	}
	for _, target := range []string{paths.Manifest, paths.Helper} {
		if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove %s: %w", target, err)
		}
	}
	if err := os.Remove(paths.Dir); err != nil && !os.IsNotExist(err) {
		if !isDirectoryNotEmpty(err) {
			return fmt.Errorf("remove helper directory: %w", err)
		}
	}
	return nil
}

func copyAtomic(source, target string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("open source helper: %w", err)
	}
	defer input.Close()

	temp, err := os.CreateTemp(filepath.Dir(target), "."+filepath.Base(target)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temporary helper: %w", err)
	}
	tempName := temp.Name()
	defer os.Remove(tempName)

	if _, err := io.Copy(temp, input); err != nil {
		temp.Close()
		return fmt.Errorf("copy helper: %w", err)
	}
	if err := temp.Chmod(mode); err != nil {
		temp.Close()
		return fmt.Errorf("set helper permissions: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("close temporary helper: %w", err)
	}
	if err := os.Rename(tempName, target); err != nil {
		return fmt.Errorf("install helper: %w", err)
	}
	return nil
}

func writeAtomic(target string, payload []byte, mode os.FileMode) error {
	temp, err := os.CreateTemp(filepath.Dir(target), "."+filepath.Base(target)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temporary manifest: %w", err)
	}
	tempName := temp.Name()
	defer os.Remove(tempName)

	if _, err := temp.Write(payload); err != nil {
		temp.Close()
		return fmt.Errorf("write manifest: %w", err)
	}
	if err := temp.Chmod(mode); err != nil {
		temp.Close()
		return fmt.Errorf("set manifest permissions: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("close temporary manifest: %w", err)
	}
	if err := os.Rename(tempName, target); err != nil {
		return fmt.Errorf("install manifest: %w", err)
	}
	return nil
}

func isDirectoryNotEmpty(err error) bool {
	return strings.Contains(strings.ToLower(err.Error()), "directory not empty")
}
