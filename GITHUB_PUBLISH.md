# GitHub Publication Commands

Run these commands from the extracted repository directory.

```powershell
git init
git branch -M main
git add .
git commit -m "feat: publish contextual memory engine MVP"

git remote add origin https://github.com/YOUR_GITHUB_USERNAME/spooky-context-memory.git
git push -u origin main
```

After the first push:

```powershell
git tag -a v0.1.0 -m "Spooky Context Memory v0.1.0"
git push origin v0.1.0
```

Create the empty public repository on GitHub before adding the remote. Do not initialize it with another README, license, or `.gitignore`, because those files already exist locally.
