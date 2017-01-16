# How to Contribute

We <3 PRs.

Follow this guide for making changes, and then adding yourself to the in-app contributors page.

## Making Changes

* Create a topic branch from where you want to base your work.
  * This is usually the master branch.
* Make commits of logical units.
* Make sure your commit messages are in the proper format. If appropriate, [use an extended commit to describe the changes involved.](https://git-scm.com/book/ch5-2.html)

````
    The short-line description is capitalized at front, and <50 chars.

    If you feel you need to write more about your commit, do so here. This can
    help future developers understand the logic of the changes you made, and
    sometimes that future developer is you!
````

* Make sure you have added the necessary tests for your changes.
* Run _all_ the tests to assure nothing else was accidentally broken.
* Update the documentation. Add new documentation files as needed.

## Common reasons a pull-request will not be accepted

* The changes need to have tests added.
* The changes need to be documented.
* The changes don't pass the `standard` formatting test.

Make sure you update tests and docs!

## Adding yourself to the Contributors page

After your first successful PR, you should create a second PR to add yourself to the contributors.yml doc.

Open `./contributors.yml` and add to the bottom a line that follows this format:

```yaml
---
name: Bob Robertson
catchphrase: That's-a spicey meatball!
website: https://bobs-homepage.com
```

Of course, you'll want to put your own name, catchphrase, and website.