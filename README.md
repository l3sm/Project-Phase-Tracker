# Project Phase Tracker

Project Phase Tracker is a small, opinionated project tracker I built because I kept losing track of what I was actually working on.

Not in a dramatic way, just the usual situation where everything feels “in progress” and nothing ever really feels done.

---

## What it is

At its core, this is a lightweight, local-first app for tracking projects through a short list of phases: **Idea**, **Build**, **Fix**, and **Done**.

I wanted something that lets me see, without thinking too much about it, what I’m working on right now, what I’ve already finished, and which projects I’ve quietly decided not to continue. Most tools can technically do this, but they usually make you set up a system first.

This one doesn’t.

You open it in a browser and you can start using it right away, which was basically the whole point.

It’s intentionally limited. That’s not an accident.

---

## Who it’s for

This is probably useful if you’re one of these:

* A solo builder or indie developer
* A freelancer with multiple projects that blur together after a while
* A small team that just wants a shared overview, not a full process
* Someone who likes structure, but gets distracted by overly flexible tools

---

## Who it’s not for

It’s also very clearly *not* meant for everyone.

* Large teams with layered, ticket-driven workflows
* Sprint-heavy or Scrum-focused environments
* People who rely on deep integrations, automation, or reporting
* Anyone looking to replace tools like Jira, Linear, or Asana

If you enjoy configuring workflows, this will probably feel too restrictive.

---

## Features

The feature set is intentionally small:

* A fixed set of phases: Idea, Build, Fix, Done
* Separate views for active projects, completed ones, and abandoned ones
* Notes that are tied to each phase, along with a simple history of changes
* A side inspector so you can edit project details without losing your place
* Keyboard-friendly navigation and basic accessibility support
* Local-first storage, with the ability to import and export data
* Light and dark themes, depending on how you like to work

Nothing here is especially clever. It’s just meant to stay out of the way.

---

## Getting started

This is a fully client-side application.

To try it out:

1. Clone the repository
2. Open `index.html` in your browser
3. Start adding projects

There’s no setup step and nothing you need to configure before it becomes useful.

---

## Data & privacy

All data is stored locally in your browser using local storage. Nothing is sent to a server and nothing leaves your machine unless you export it yourself.

If you want to back things up or move your data elsewhere, you can export your projects as a JSON file and import them again later.

---

## License

View LICENSE.md

