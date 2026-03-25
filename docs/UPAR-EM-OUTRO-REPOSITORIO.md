# Subir disparorapido_api em outro repositório

Para evitar problema de autorização ao gerar e publicar a imagem Docker (ex.: GHCR), você pode ter o código da API em um **repositório separado** (sob sua conta ou uma org onde você tem permissão) e fazer build/push a partir dele.

**Repositório novo:** https://github.com/ThiagoBelagamba/disparorapido-api

---

## Trocar do repositório antigo para o novo (já está em um git)

Se o projeto **já está** em um repositório git (o “git antigo”) e você quer **deixar de sincronizar com ele** e passar a usar só o **novo** repositório:

### Onde rodar os comandos

- Se o **repositório git** (a pasta `.git`) está **dentro** de `disparorapido_api` → abra o terminal **dentro** de `disparorapido_api`.
- Se o repositório git está **acima** (ex.: em `workspace2`) e `disparorapido_api` é só uma pasta versionada → você tem duas opções:
  - **A)** Trocar o remote do repositório **pai** (workspace2) para o novo repo — aí todo o workspace2 vai para o novo repo; ou  
  - **B)** Usar a Opção 1 abaixo (copiar só a pasta `disparorapido_api` para outro lugar e fazer push só dela para o novo repo).

### Comandos para trocar o remote e passar a usar o novo repo

No terminal, na pasta que é a **raiz do repositório git** (onde está a pasta `.git`):

```powershell
# 1) Ver para onde o origin aponta hoje (repositório antigo)
git remote -v

# 2) Trocar o origin para o novo repositório
git remote set-url origin https://github.com/ThiagoBelagamba/disparorapido-api.git

# 3) Conferir
git remote -v

# 4) Enviar o código para o novo repo (branch main)
git push -u origin main
```

Se a sua branch se chama **master** em vez de main:

```powershell
git push -u origin master
```

Se o GitHub criou um README (ou outro arquivo) no novo repo e o push reclamar de históricos diferentes:

```powershell
git pull origin main --allow-unrelated-histories
# Resolva conflitos se aparecerem, depois:
git push -u origin main
```

Ou, se o novo repo está **vazio** e você quer **sobrescrever** com o que está aí (cuidado: apaga o que tiver no GitHub):

```powershell
git push -u origin main --force
```

Depois disso, **sincronizar** no VS Code/Cursor passa a ser com o **novo** repositório (ThiagoBelagamba/disparorapido-api). O repositório antigo deixa de ser o `origin`.

---

## Opção 1: Novo repo só com esta pasta (recomendado)

Assim o outro repo fica **independente** do workspace2 e você não mexe no repositório atual.

### 1. Criar o repositório no GitHub

1. No GitHub: **New repository**.
2. Nome sugerido: `disparorapido-api` ou `leadsrapido-backend`.
3. Deixe **vazio** (sem README, .gitignore ou license).
4. Repositório: **https://github.com/ThiagoBelagamba/disparorapido-api**

### 2. Copiar a pasta e inicializar git nela

No PowerShell (ou CMD), **fora** do workspace2 (para não criar repo dentro do outro):

```powershell
# Criar pasta temporária e copiar o conteúdo da API (sem .git do pai)
$dest = "C:\temp\disparorapido-api"
New-Item -ItemType Directory -Path $dest -Force
Copy-Item -Path "C:\workspace\workspace2\disparorapido_api\*" -Destination $dest -Recurse -Force
# Não copiar node_modules (opcional, reduz tamanho)
Remove-Item -Path "$dest\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
```

### 3. Inicializar git e fazer o primeiro push

```powershell
cd C:\temp\disparorapido-api

git init
git add .
git commit -m "chore: initial commit - disparorapido API"
git branch -M main
git remote add origin https://github.com/ThiagoBelagamba/disparorapido-api.git
git push -u origin main
```

### 4. Build e push da imagem a partir do novo repo

Daqui em diante, use **esse clone** para build e push:

```powershell
cd C:\temp\disparorapido-api

docker build -f docker/Dockerfile -t ghcr.io/ThiagoBelagamba/disparorapido-api:1.0.0 .
docker push ghcr.io/ThiagoBelagamba/disparorapido-api:1.0.0
```

No Portainer, aponte a imagem para `ghcr.io/ThiagoBelagamba/disparorapido-api:1.0.0`.

---

## Opção 2: Transformar esta pasta no próprio repo (sem copiar)

Se quiser que **esta** pasta `disparorapido_api` vire um repo sozinho (e o workspace2 deixe de versionar o conteúdo dela, ou passe a tratá-la como submodule):

```powershell
cd C:\workspace\workspace2\disparorapido_api

git init
git add .
git commit -m "chore: initial commit - disparorapido API"
git branch -M main
git remote add origin https://github.com/ThiagoBelagamba/disparorapido-api.git
git push -u origin main
```

**Atenção:** isso cria um repositório **dentro** de `workspace2`. O repositório pai (workspace2) pode passar a ver `disparorapido_api` como submódulo ou como pasta com outro `.git`. Se o pai já versionava os arquivos de `disparorapido_api`, pode ser preciso remover essa pasta do índice do pai (`git rm -r --cached disparorapido_api`) e, se quiser, adicionar como submodule. Por isso a **Opção 1** costuma ser mais simples.

---

## Resumo rápido (Opção 1)

| Passo | Ação |
|-------|------|
| 1 | Criar repo vazio no GitHub (ex.: `disparorapido-api`) |
| 2 | Copiar conteúdo de `disparorapido_api` para uma pasta nova (ex.: `C:\temp\disparorapido-api`) |
| 3 | Nessa pasta: `git init`, `git add .`, `git commit`, `git remote add origin <url>`, `git push -u origin main` |
| 4 | Build/push da imagem a partir dessa pasta; no Portainer usar `ghcr.io/ThiagoBelagamba/disparorapido-api:1.0.0` |

Assim a imagem passa a ser gerada e publicada a partir de um repositório onde você tem permissão, evitando o problema de autorização.
