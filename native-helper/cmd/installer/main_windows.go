//go:build windows

package main

import (
	_ "embed"
	"fmt"
	"os"
	"strings"
	"syscall"
	"unsafe"

	"petesgarden/windowshelper/internal/install"
)

//go:embed payload/org.petesgarden.zebra.exe
var helperPayload []byte

var extensionID string

func main() {
	if len(os.Args) > 1 && strings.EqualFold(os.Args[1], "/uninstall") {
		runUninstall()
		return
	}
	if _, err := install.Install(helperPayload, extensionID); err != nil {
		showMessage("Installation failed", fmt.Sprintf("Pete's Garden Zebra Helper could not be installed.\n\n%v", err), messageBoxError)
		os.Exit(1)
	}
	showMessage("Installation complete", "Pete's Garden Zebra Helper was installed for this Windows user.", messageBoxInformation)
}

func runUninstall() {
	paths, uninstallErr := install.Uninstall()
	if uninstallErr != nil {
		showMessage("Uninstall warning", fmt.Sprintf("Pete's Garden Zebra Helper encountered a problem while uninstalling.\n\n%v", uninstallErr), messageBoxError)
	} else {
		showMessage("Uninstall complete", "Pete's Garden Zebra Helper was removed for this Windows user.", messageBoxInformation)
	}
	if cleanupErr := install.ScheduleCleanup(paths); cleanupErr != nil {
		showMessage("Cleanup failed", fmt.Sprintf("The installed files could not be scheduled for deletion.\n\n%v", cleanupErr), messageBoxError)
		os.Exit(1)
	}
	if uninstallErr != nil {
		os.Exit(1)
	}
}

const (
	messageBoxError       = 0x00000010
	messageBoxInformation = 0x00000040
)

var (
	user32DLL       = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW = user32DLL.NewProc("MessageBoxW")
)

func showMessage(title, message string, flags uintptr) {
	titlePointer, titleErr := syscall.UTF16PtrFromString(title)
	messagePointer, messageErr := syscall.UTF16PtrFromString(message)
	if titleErr != nil || messageErr != nil {
		return
	}
	procMessageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(messagePointer)),
		uintptr(unsafe.Pointer(titlePointer)),
		flags,
	)
}
