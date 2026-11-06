package cups

import (
	"bufio"
	"bytes"
	"fmt"
	"sort"
	"strings"
)

type Runner interface {
	Output(name string, args ...string) ([]byte, error)
	Run(name string, args []string, input []byte) error
}

type Spooler struct {
	Runner Runner
}

func ParsePrinterNames(output []byte) []string {
	seen := map[string]bool{}
	var names []string
	scanner := bufio.NewScanner(bytes.NewReader(output))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 2 && fields[0] == "printer" && !seen[fields[1]] {
			seen[fields[1]] = true
			names = append(names, fields[1])
		}
	}
	sort.Strings(names)
	return names
}

func (s Spooler) ListPrinters() ([]string, error) {
	if s.Runner == nil {
		return nil, fmt.Errorf("CUPS runner is not configured")
	}
	output, err := s.Runner.Output("/usr/bin/lpstat", "-p")
	if err != nil {
		return nil, fmt.Errorf("lpstat -p: %w", err)
	}
	return ParsePrinterNames(output), nil
}

func (s Spooler) PrintRaw(name string, raw []byte) error {
	names, err := s.ListPrinters()
	if err != nil {
		return err
	}
	found := false
	for _, installed := range names {
		if installed == name {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("printer %q is not an installed printer queue", name)
	}
	if err := s.Runner.Run("/usr/bin/lp", []string{"-d", name, "-o", "raw"}, raw); err != nil {
		return fmt.Errorf("lp raw print: %w", err)
	}
	return nil
}
