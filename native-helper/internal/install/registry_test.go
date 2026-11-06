package install

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestExecuteRegistryCommandsRunsArgumentsInOrder(t *testing.T) {
	commands := [][]string{{"ADD", "first"}, {"ADD", "second"}}
	var got [][]string
	execute := func(args []string) error {
		got = append(got, append([]string(nil), args...))
		return nil
	}

	if err := ExecuteRegistryCommands(commands, execute); err != nil {
		t.Fatalf("ExecuteRegistryCommands() error = %v", err)
	}
	if !reflect.DeepEqual(got, commands) {
		t.Fatalf("executed = %#v, want %#v", got, commands)
	}
}

func TestExecuteRegistryCommandsStopsAndAddsContextOnFailure(t *testing.T) {
	commands := [][]string{{"ADD", "first"}, {"ADD", "second"}, {"ADD", "third"}}
	count := 0
	execute := func(args []string) error {
		count++
		if args[1] == "second" {
			return errors.New("access denied")
		}
		return nil
	}

	err := ExecuteRegistryCommands(commands, execute)
	if err == nil || !strings.Contains(err.Error(), "second") || !strings.Contains(err.Error(), "access denied") {
		t.Fatalf("ExecuteRegistryCommands() error = %v", err)
	}
	if count != 2 {
		t.Fatalf("executed %d commands, want 2", count)
	}
}

func TestExecuteAllRegistryCommandsContinuesAfterFailures(t *testing.T) {
	commands := [][]string{{"DELETE", "first"}, {"DELETE", "second"}}
	var got []string
	execute := func(args []string) error {
		got = append(got, args[1])
		return errors.New("missing key")
	}

	err := ExecuteAllRegistryCommands(commands, execute)
	if err == nil || !strings.Contains(err.Error(), "first") || !strings.Contains(err.Error(), "second") {
		t.Fatalf("ExecuteAllRegistryCommands() error = %v", err)
	}
	if !reflect.DeepEqual(got, []string{"first", "second"}) {
		t.Fatalf("executed = %#v", got)
	}
}
