package host

import (
	"strings"
	"testing"
)

const sampleOrigin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"

func TestValidateCallerOriginRequiresExactOrigin(t *testing.T) {
	if err := ValidateCallerOrigin([]string{"host.exe", sampleOrigin}, sampleOrigin); err != nil {
		t.Fatalf("ValidateCallerOrigin() error = %v", err)
	}
}

func TestValidateCallerOriginRejectsMissingOrigin(t *testing.T) {
	err := ValidateCallerOrigin([]string{"host.exe"}, sampleOrigin)
	if err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("ValidateCallerOrigin() error = %v, want missing-origin error", err)
	}
}

func TestValidateCallerOriginRejectsNearMatches(t *testing.T) {
	for _, caller := range []string{
		"chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab/",
		"https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
		sampleOrigin + "extra",
	} {
		t.Run(caller, func(t *testing.T) {
			if err := ValidateCallerOrigin([]string{"host.exe", caller}, sampleOrigin); err == nil {
				t.Fatalf("ValidateCallerOrigin() accepted %q", caller)
			}
		})
	}
}

func TestOriginFromExtensionIDValidatesChromeID(t *testing.T) {
	got, err := OriginFromExtensionID("abcdefghijklmnopabcdefghijklmnop")
	if err != nil {
		t.Fatalf("OriginFromExtensionID() error = %v", err)
	}
	if want := "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"; got != want {
		t.Fatalf("OriginFromExtensionID() = %q, want %q", got, want)
	}

	for _, invalid := range []string{"", "abc", "ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP", "qrstuvwxyzabcdefqrstuvwxyzabcdef", "abcdefghijklmnopabcdefghijklmnop\n"} {
		if _, err := OriginFromExtensionID(invalid); err == nil {
			t.Fatalf("OriginFromExtensionID(%q) succeeded", invalid)
		}
	}
}
