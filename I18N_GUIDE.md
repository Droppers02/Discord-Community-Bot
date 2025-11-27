# 🌍 Guia de Internacionalização (i18n)

## Estrutura de Branches

O EPA BOT agora suporta dois idiomas através de branches separadas:

```
main (Português) ←→ en (English)
```

- **Branch `main`**: Versão em Português de Portugal (padrão)
- **Branch `en`**: Versão em English

---

## 🚀 Como Usar

### Escolher Idioma

**Para usar a versão em Português:**

```bash
git checkout main
```

**Para usar a versão em English:**

```bash
git checkout en
```

### Configurar Idioma

No ficheiro `.env`, define:

```env
# Para Português
BOT_LANGUAGE=pt

# Para English
BOT_LANGUAGE=en
```

---

## 👨‍💻 Desenvolvimento

### Adicionar Nova Funcionalidade

Se estás a adicionar uma nova funcionalidade que precisa de aparecer em ambos os idiomas:

#### 1. Desenvolver na branch `main` (Português)

```bash
git checkout main
# Desenvolve a funcionalidade em português
git add .
git commit -m "feat: nova funcionalidade"
git push origin main
```

#### 2. Traduzir para English na branch `en`

```bash
git checkout en
git merge main  # Traz as mudanças da main

# Traduz os textos para inglês
# Edita os ficheiros necessários

git add .
git commit -m "feat: traduzir nova funcionalidade para inglês"
git push origin en
```

### Sistema de Tradução

O sistema i18n está em `config/i18n.py`. Para adicionar novas traduções:

```python
TRANSLATIONS = {
    "en": {
        "categoria": {
            "chave": "English text here"
        }
    },
    "pt": {
        "categoria": {
            "chave": "Texto em português aqui"
        }
    }
}
```

**Uso no código:**

```python
from config.i18n import get_translator

# Obter tradutor
t = get_translator("en")  # ou "pt"

# Usar tradução
title = t("categoria.chave")

# Com formatação
message = t("common.insufficient_funds", balance=1000)
```

---

## 📝 Ficheiros que Precisam de Tradução

Quando adicionas uma nova funcionalidade, traduz estes ficheiros:

### Obrigatórios

- `cogs/*.py` - Descrições de comandos, mensagens
- `config/i18n.py` - Adicionar chaves de tradução

### Recomendados

- `cogs/help.py` - Atualizar lista de comandos
- `CHANGELOG.md` - Documentar mudanças
- `README.md` - Atualizar documentação em ambos os branches (PT no main, EN no en)

---

## 🔄 Workflow Sugerido

### Fluxo Normal de Desenvolvimento

```bash
# 1. Desenvolve em Português (main)
git checkout main
# ... faz mudanças ...
git commit -m "feat: nova funcionalidade"
git push origin main

# 2. Traduz para English (en)
git checkout en
git merge main
# ... traduz textos ...
git commit -m "feat: traduzir nova funcionalidade"
git push origin en
```

### Correção de Bug que Afeta Ambas as Branches

```bash
# 1. Corrige na main
git checkout main
# ... corrige o bug ...
git commit -m "fix: corrigir bug X"
git push origin main

# 2. Aplica na branch en
git checkout en
git merge main
# Se houver conflitos em traduções, resolve manualmente
git push origin en
```

---

## 🎯 Boas Práticas

### ✅ Fazer

- Manter `main` como fonte principal de desenvolvimento
- Traduzir regularmente para `en`
- Usar o sistema i18n para novos textos
- Testar em ambas as branches antes de release
- Manter CHANGELOG atualizado em ambas as branches

### ❌ Evitar

- Desenvolver funcionalidades diretamente na branch `en`
- Deixar traduções acumularem (traduzir regularmente)
- Hardcoded strings (usar sempre i18n)
- Commits diferentes entre branches (manter sincronizado)

---

## 📊 Estado Atual

### ✅ Completamente Traduzido

- `cogs/help.py` - Comando /help
- `config/i18n.py` - Sistema de traduções
- `config/settings.py` - Suporte a idioma
- `README.md` (branch en) - Documentação em inglês
- `CHANGELOG.md` - Ambas as versões

### 🚧 A Traduzir (Futuro)

Conforme novas funcionalidades forem adicionadas, traduzir:

- Todos os cogs com comandos visíveis ao utilizador
- Mensagens de erro e sucesso
- Embeds e views interativas
- Documentação adicional

---

## 🔧 Troubleshooting

### Conflitos ao fazer merge

Se houver conflitos ao fazer `git merge main` na branch `en`:

1. Os conflitos serão principalmente em textos traduzidos
2. Resolve manualmente mantendo a versão em inglês
3. Commit o merge:
   ```bash
   git add .
   git commit -m "merge: resolver conflitos de tradução"
   ```

### Branch desatualizada

Se a branch `en` ficar muito atrás da `main`:

```bash
git checkout en
git merge main
# Resolve conflitos se houver
git push origin en
```

---

## 📞 Suporte

Para questões sobre internacionalização:

- Consulta `config/i18n.py` para exemplos
- Ver commits com "i18n" ou "traduz" para referência
- Mantém consistência entre as branches

---

**Autor:** Droppers 🇵🇹  
**Versão:** 2.7.0
