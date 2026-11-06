package install

import (
	"errors"
	"fmt"
	"strings"
)

func ExecuteRegistryCommands(commands [][]string, execute func(args []string) error) error {
	for _, command := range commands {
		if err := execute(command); err != nil {
			return fmt.Errorf("reg.exe %s: %w", strings.Join(command, " "), err)
		}
	}
	return nil
}

func ExecuteAllRegistryCommands(commands [][]string, execute func(args []string) error) error {
	var failures []error
	for _, command := range commands {
		if err := execute(command); err != nil {
			failures = append(failures, fmt.Errorf("reg.exe %s: %w", strings.Join(command, " "), err))
		}
	}
	return errors.Join(failures...)
}
