# Sistema de Versionamento Automático

Este projeto utiliza versionamento semântico (SemVer) com conventional commits para automatizar o processo de release.

## Como Funciona

### Conventional Commits

Use os seguintes prefixos nos seus commits:

- `feat:` - Nova funcionalidade (incrementa versão **MINOR**)
- `fix:` - Correção de bug (incrementa versão **PATCH**)
- `perf:` - Melhoria de performance (incrementa versão **PATCH**)
- `refactor:` - Refatoração de código (incrementa versão **PATCH**)
- `docs:` - Mudanças na documentação (não altera versão)
- `style:` - Mudanças de formatação (não altera versão)
- `test:` - Adição/modificação de testes (não altera versão)
- `chore:` - Tarefas de manutenção (não altera versão)
- `ci:` - Mudanças no CI/CD (não altera versão)
- `build:` - Mudanças no sistema de build (não altera versão)

### Breaking Changes

Para mudanças que quebram a compatibilidade (incrementa versão **MAJOR**):

```
feat!: nova API que quebra compatibilidade

BREAKING CHANGE: removida função obsoleta xyz()
```

ou

```
feat: nova funcionalidade

BREAKING CHANGE: mudança na interface da API
```

## Exemplos de Commits

```bash
# Incrementa PATCH (1.0.0 -> 1.0.1)
git commit -m "fix: corrige bug na validação de dados"

# Incrementa MINOR (1.0.0 -> 1.1.0)
git commit -m "feat: adiciona endpoint de relatórios"

# Incrementa MAJOR (1.0.0 -> 2.0.0)
git commit -m "feat!: nova arquitetura de autenticação

BREAKING CHANGE: tokens antigos não são mais válidos"
```

## Processo Automático

1. **Push para main**: Triggera o workflow
2. **Análise de commits**: Verifica conventional commits desde a última tag
3. **Geração de versão**: Calcula nova versão baseada nos tipos de commit
4. **Criação de CHANGELOG**: Gera changelog automaticamente
5. **Tag e commit**: Cria tag git e commit de release
6. **Build de imagens**: Constrói imagens Docker com as tags corretas
7. **Deploy**: Faz deploy da nova versão

## Scripts Disponíveis

```bash
# Release automático (baseado nos commits)
npm run release

# Forçar tipo específico de release
npm run release:patch    # 1.0.0 -> 1.0.1
npm run release:minor    # 1.0.0 -> 1.1.0
npm run release:major    # 1.0.0 -> 2.0.0

# Pre-release (alpha, beta, rc)
npm run release:prerelease

# Primeiro release
npm run release:first

# Dry run (simula sem executar)
npm run release:dry-run
```

## Tags das Imagens Docker

As imagens Docker são taggeadas automaticamente com:

- `latest` - Última versão estável
- `v1.2.3` - Tag da versão específica
- `1.2.3` - Versão sem prefixo 'v'
- `main-abc1234` - SHA do commit no branch main

## Configuração

### Arquivos de Configuração

- `.commitlintrc.js` - Regras de validação dos commits
- `.versionrc.json` - Configuração do standard-version
- `.husky/commit-msg` - Hook que valida mensagens de commit
- `.github/workflows/ci-cd.yml` - Pipeline de CI/CD

### Hooks do Git

O projeto usa Husky para validar commits:
- **commit-msg**: Valida formato do commit com commitlint

## Troubleshooting

### Commit rejeitado

Se seu commit for rejeitado, verifique se segue o padrão:

```
<tipo>(<escopo>): <descrição>

<corpo>

<rodapé>
```

Exemplo correto:
```
feat(api): adiciona endpoint de usuários

Implementa CRUD completo para gerenciamento de usuários
com validação e autenticação.

Closes #123
```

### Pular versionamento

Para commits que não devem gerar nova versão, use tipos como:
- `docs:`
- `style:`
- `test:`
- `chore:`

### Release manual

Se necessário, você pode fazer release manual:

```bash
# Gerar release baseado nos commits
npm run release

# Ou forçar uma versão específica
npm run release:minor
```

## Benefícios

1. **Consistência**: Todas as versões seguem SemVer
2. **Automação**: Zero trabalho manual para releases
3. **Rastreabilidade**: Changelog automático com links para commits
4. **Qualidade**: Commits padronizados e validados
5. **Deploy seguro**: Apenas versões validadas vão para produção
