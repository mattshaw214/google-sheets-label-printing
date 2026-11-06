package host

import "fmt"

func ValidateCallerOrigin(args []string, expected string) error {
	if len(args) < 2 {
		return fmt.Errorf("missing Chrome extension caller origin")
	}
	if args[1] != expected {
		return fmt.Errorf("caller origin %q is not authorized", args[1])
	}
	return nil
}

func OriginFromExtensionID(extensionID string) (string, error) {
	if len(extensionID) != 32 {
		return "", fmt.Errorf("Chrome extension ID must contain exactly 32 characters")
	}
	for _, char := range extensionID {
		if char < 'a' || char > 'p' {
			return "", fmt.Errorf("Chrome extension ID contains invalid character %q", char)
		}
	}
	return "chrome-extension://" + extensionID + "/", nil
}
