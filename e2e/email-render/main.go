// Renderar en Supabase-e-postmall precis som Supabase Auth gör (Go html/template,
// samma fältnamn). Okända fält som {{ .Foo }} ger fel – så stavfel upptäcks.
//
//	go run ./e2e/email-render supabase/templates/confirm-signup.html > ut.html
package main

import (
	"html/template"
	"os"
)

type data struct {
	SiteURL         string
	ConfirmationURL string
	Email           string
	NewEmail        string
	Token           string
	TokenHash       string
	RedirectTo      string
	Data            map[string]any
}

func main() {
	src, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	t, err := template.New("mail").Parse(string(src))
	if err != nil {
		os.Stderr.WriteString("parse: " + err.Error() + "\n")
		os.Exit(2)
	}
	err = t.Execute(os.Stdout, data{
		SiteURL:         env("SITE_URL", "https://ptapp2.vercel.app"),
		ConfirmationURL: "https://projekt.supabase.co/auth/v1/verify?token=x&type=signup",
		Email:           "sara@example.com",
		NewEmail:        "sara.ny@example.com",
		Token:           "482913",
		TokenHash:       env("TOKEN_HASH", "pkce_9f2c0d1e8a7b6c5d4e3f2a1b0c9d8e7f"),
		RedirectTo:      "",
		Data:            map[string]any{},
	})
	if err != nil {
		os.Stderr.WriteString("execute: " + err.Error() + "\n")
		os.Exit(3)
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
