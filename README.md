# pylibviz

Visualizador de compatibilidade entre bibliotecas Python, releases no PyPI e versoes do Python.

## Objetivo

Este projeto resolve a dor de verificar conflitos de versao entre pacotes Python.
Voce cola um requirements.txt em texto e recebe:

- lista de pacotes detectados;
- timeline das ultimas releases de cada pacote;
- comparacao de compatibilidade por versao de Python selecionada;
- destaque das releases que atendem o specifier definido no requirements.

## Como funciona

- Interface estatica (compativel com GitHub Pages).
- Parser de requirements e regras de specifier em Python, executando no navegador via PyScript.
- Metadados de releases consultados em tempo real na API JSON do PyPI.
- Compatibilidade calculada com base no campo requires_python de cada release.

## Estrutura

- index.html: pagina principal.
- styles.css: estilo visual.
- app.js: consulta ao PyPI e renderizacao da timeline.
- app.py: parser de requirements e avaliacao de compatibilidade (PEP 508 / specifiers).
- pyscript.toml: dependencias Python carregadas no navegador.

## Executar localmente

Opcao simples:

```bash
python -m http.server 8000
```

Depois abra no navegador: <http://localhost:8000>

## Publicar no GitHub Pages

Este repositório já inclui um workflow em [.github/workflows/pages.yml](.github/workflows/pages.yml) para publicar automaticamente no GitHub Pages a cada push na branch `main`.

1. Envie os arquivos para o repositório.
2. No GitHub, abra Settings > Pages.
3. Em Build and deployment, selecione Source: GitHub Actions.
4. Faça push para `main` e aguarde o job concluir.
5. O link publicado aparecerá na aba Actions e em Settings > Pages.

## Limites atuais (MVP)

- Linhas com -r/--requirement sao sinalizadas, mas nao carregadas automaticamente.
- O recorte exibe as ultimas 16 releases por pacote (para manter desempenho no navegador).
- Se um pacote nao informa requires_python em determinada release, ela e tratada como compativel por falta de restricao explicita.
