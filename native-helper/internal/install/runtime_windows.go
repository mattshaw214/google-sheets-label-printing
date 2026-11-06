//go:build windows

package install

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func Install(helperPayload []byte, extensionID string) (Paths, error) {
	var paths Paths
	if len(helperPayload) == 0 {
		return paths, fmt.Errorf("embedded native host is empty")
	}
	manifest, err := NativeManifest(extensionID)
	if err != nil {
		return paths, fmt.Errorf("validate extension ID: %w", err)
	}
	paths, err = TargetPaths(os.Getenv("LOCALAPPDATA"))
	if err != nil {
		return paths, err
	}
	if err := os.MkdirAll(paths.Dir, 0o700); err != nil {
		return paths, fmt.Errorf("create install directory: %w", err)
	}
	if err := writeFileAtomic(paths.Helper, helperPayload, 0o700); err != nil {
		return paths, err
	}
	if err := writeFileAtomic(paths.Manifest, manifest, 0o600); err != nil {
		return paths, err
	}
	self, err := os.Executable()
	if err != nil {
		return paths, fmt.Errorf("locate setup executable: %w", err)
	}
	if !strings.EqualFold(filepath.Clean(self), filepath.Clean(paths.Uninstaller)) {
		installerPayload, err := os.ReadFile(self)
		if err != nil {
			return paths, fmt.Errorf("read setup executable: %w", err)
		}
		if err := writeFileAtomic(paths.Uninstaller, installerPayload, 0o700); err != nil {
			return paths, err
		}
	}
	if err := ExecuteRegistryCommands(InstallRegistryCommands(paths), runReg); err != nil {
		return paths, err
	}
	return paths, nil
}

func Uninstall() (Paths, error) {
	paths, err := TargetPaths(os.Getenv("LOCALAPPDATA"))
	if err != nil {
		return paths, err
	}
	registryErr := ExecuteAllRegistryCommands(UninstallRegistryCommands(), runReg)
	var fileErrors []error
	for _, target := range []string{paths.Helper, paths.Manifest} {
		if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
			fileErrors = append(fileErrors, fmt.Errorf("remove %s: %w", target, err))
		}
	}
	return paths, errors.Join(registryErr, errors.Join(fileErrors...))
}

func ScheduleCleanup(paths Paths) error {
	executable, args, err := CleanupCommand(paths.Dir)
	if err != nil {
		return err
	}
	command := exec.Command(executable, args...)
	command.Dir = os.TempDir()
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	if err := command.Start(); err != nil {
		return fmt.Errorf("schedule install-directory deletion: %w", err)
	}
	if err := command.Process.Release(); err != nil {
		return fmt.Errorf("release cleanup process: %w", err)
	}
	return nil
}

func runReg(args []string) error {
	command := exec.Command("reg.exe", args...)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	output, err := command.CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(output))
		if detail == "" {
			detail = err.Error()
		}
		return fmt.Errorf("%s", detail)
	}
	return nil
}
