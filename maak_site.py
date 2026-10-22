"""Bouwt site/index.html uit site_bron/ (template + schema-lezer + app). Alleen nodig na code-wijzigingen."""
from pathlib import Path

R = Path(__file__).resolve().parent.parent
b = R / "site_bron"
html = (b / "index.template.html").read_text(encoding="utf-8")
html = html.replace("/*PARSER*/", (b / "parser.js").read_text(encoding="utf-8")).replace("/*APP*/", (b / "app.js").read_text(encoding="utf-8"))
(R / "site").mkdir(exist_ok=True)
(R / "site" / "index.html").write_text(html, encoding="utf-8")
print("site/index.html gebouwd")
