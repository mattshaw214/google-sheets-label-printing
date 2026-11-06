package install

import (
	"encoding/json"
	"fmt"
	"strings"

	"petesgarden/windowshelper/internal/host"
)

const (
	NativeHostName   = "org.petesgarden.zebra"
	HelperFileName   = NativeHostName + ".exe"
	ManifestFileName = NativeHostName + ".json"
	ProductName      = "Pete's Garden Zebra Helper"
	ProductVersion   = "1.0.0"
	PublisherName    = "Pete's Garden"

	NativeRegistryKey = `HKCU\Software\Google\Chrome\NativeMessagingHosts\` + NativeHostName
	ARPRegistryKey    = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\PetesGardenZebraHelper`
)

type Paths struct {
	Dir         string
	Helper      string
	Manifest    string
	Uninstaller string
}

func TargetPaths(localAppData string) (Paths, error) {
	localAppData = strings.TrimRight(localAppData, `\/`)
	if strings.TrimSpace(localAppData) == "" {
		return Paths{}, fmt.Errorf("LOCALAPPDATA is not set")
	}
	directory := windowsJoin(localAppData, "Pete's Garden", "Zebra Helper")
	return Paths{
		Dir:         directory,
		Helper:      windowsJoin(directory, HelperFileName),
		Manifest:    windowsJoin(directory, ManifestFileName),
		Uninstaller: windowsJoin(directory, "Uninstall.exe"),
	}, nil
}

func NativeManifest(extensionID string) ([]byte, error) {
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
		Path:           HelperFileName,
		Type:           "stdio",
		AllowedOrigins: []string{origin},
	}
	payload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode native manifest: %w", err)
	}
	return append(payload, '\n'), nil
}

func InstallRegistryCommands(paths Paths) [][]string {
	uninstallString := `"` + paths.Uninstaller + `" /uninstall`
	return [][]string{
		{"ADD", NativeRegistryKey, "/ve", "/t", "REG_SZ", "/d", paths.Manifest, "/f"},
		regSet(ARPRegistryKey, "DisplayName", "REG_SZ", ProductName),
		regSet(ARPRegistryKey, "DisplayVersion", "REG_SZ", ProductVersion),
		regSet(ARPRegistryKey, "Publisher", "REG_SZ", PublisherName),
		regSet(ARPRegistryKey, "InstallLocation", "REG_SZ", paths.Dir),
		regSet(ARPRegistryKey, "UninstallString", "REG_SZ", uninstallString),
		regSet(ARPRegistryKey, "NoModify", "REG_DWORD", "1"),
		regSet(ARPRegistryKey, "NoRepair", "REG_DWORD", "1"),
	}
}

func UninstallRegistryCommands() [][]string {
	return [][]string{
		{"DELETE", NativeRegistryKey, "/f"},
		{"DELETE", ARPRegistryKey, "/f"},
	}
}

func CleanupCommand(directory string) (string, []string, error) {
	if strings.TrimSpace(directory) == "" {
		return "", nil, fmt.Errorf("cleanup directory is empty")
	}
	if strings.ContainsAny(directory, "&|<>^%\"\r\n") {
		return "", nil, fmt.Errorf("cleanup directory contains unsafe command characters")
	}
	command := `ping 127.0.0.1 -n 3 >NUL & rmdir /S /Q "` + directory + `"`
	return "cmd.exe", []string{"/D", "/S", "/C", command}, nil
}

func regSet(key, name, valueType, data string) []string {
	return []string{"ADD", key, "/v", name, "/t", valueType, "/d", data, "/f"}
}

func windowsJoin(base string, elements ...string) string {
	result := strings.TrimRight(base, `\/`)
	for _, element := range elements {
		result += `\` + strings.Trim(element, `\/`)
	}
	return result
}
