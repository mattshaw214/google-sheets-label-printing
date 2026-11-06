package winspool

import (
	"sort"
	"strings"
)

func NormalizePrinterNames(names []string) []string {
	result := make([]string, 0, len(names))
	for _, name := range names {
		if strings.TrimSpace(name) == "" || containsFold(result, name) {
			continue
		}
		result = append(result, name)
	}
	sort.Slice(result, func(left, right int) bool {
		leftFolded := strings.ToLower(result[left])
		rightFolded := strings.ToLower(result[right])
		if leftFolded == rightFolded {
			return result[left] < result[right]
		}
		return leftFolded < rightFolded
	})
	return result
}

func containsFold(names []string, candidate string) bool {
	for _, name := range names {
		if strings.EqualFold(name, candidate) {
			return true
		}
	}
	return false
}
