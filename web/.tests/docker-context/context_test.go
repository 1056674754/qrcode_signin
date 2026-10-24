package contextregression

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/moby/patternmatcher"
	"github.com/moby/patternmatcher/ignorefile"
)

// Docker/Moby's matcher differs from gitignore: reopening a parent directory
// also reopens descendants unless later patterns explicitly exclude them.
func TestDockerContextAllowsOnlyPublicDistAndExactPrivateReceiptAndGuard(t *testing.T) {
	f, err := os.Open("../../.dockerignore")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	patterns, err := ignorefile.ReadAll(f)
	if err != nil {
		t.Fatal(err)
	}
	matcher, err := patternmatcher.New(patterns)
	if err != nil {
		t.Fatal(err)
	}

	allowed := []string{
		"Dockerfile", "nginx.conf", "dist/index.html",
		"dist/assets/index-FAKE1234.js", "dist/assets/index-FAKE1234.css",
		".monitoring-private/upload-receipt.json", "scripts/image-guard.cjs",
	}
	denied := []string{
		".monitoring-private/assets/index-FAKE1234.js",
		".monitoring-private/assets/index-FAKE1234.js.map",
		".monitoring-private/manifest.json", ".monitoring-private/sourcesContent.json",
		".monitoring-private/secret", ".monitoring-private/.env",
		".monitoring-private/nested/upload-receipt.json",
		"scripts/private-artifacts.mjs", "scripts/secret", "scripts/.env",
		"scripts/nested/image-guard.cjs", ".env", "secret",
		"src/pages/OAuthCallback.tsx", "node_modules/pocketbase/package.json",
		".tests/docker-context/context_test.go", ".evidence/_synthetic-events.json",
	}
	root := ".fixture-context"
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(root)
	for _, name := range append(append([]string{}, allowed...), denied...) {
		full := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("FAKE SYNTHETIC CONTENT ONLY"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	var included []string
	err = filepath.WalkDir(root, func(full string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		} // descend: negations may reopen descendants
		relative, err := filepath.Rel(root, full)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(relative)
		excluded, err := matcher.MatchesOrParentMatches(name)
		if err != nil {
			return err
		}
		if !excluded {
			included = append(included, name)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(allowed)
	sort.Strings(included)
	if !reflect.DeepEqual(included, allowed) {
		t.Fatalf("Moby context contains unexpected files or omits required artifacts:\nactual:\n%s\nwant:\n%s", strings.Join(included, "\n"), strings.Join(allowed, "\n"))
	}
	for _, directory := range []string{"dist", "dist/assets", "scripts", ".monitoring-private"} {
		excluded, err := matcher.MatchesOrParentMatches(directory)
		if err != nil || excluded {
			t.Errorf("required parent %s unavailable: excluded=%v error=%v", directory, excluded, err)
		}
	}
}
