package winspool

import (
	"reflect"
	"testing"
)

func TestNormalizePrinterNamesDeduplicatesCaseInsensitivelyAndSorts(t *testing.T) {
	input := []string{"zebra zd421", "Office", "ZEBRA ZD421", "  ", "Alpha", "office"}

	got := NormalizePrinterNames(input)
	want := []string{"Alpha", "Office", "zebra zd421"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NormalizePrinterNames() = %#v, want %#v", got, want)
	}
}

func TestNormalizePrinterNamesDoesNotMutateInput(t *testing.T) {
	input := []string{"Zebra", "Alpha"}
	wantInput := append([]string(nil), input...)

	_ = NormalizePrinterNames(input)
	if !reflect.DeepEqual(input, wantInput) {
		t.Fatalf("input mutated to %#v", input)
	}
}
