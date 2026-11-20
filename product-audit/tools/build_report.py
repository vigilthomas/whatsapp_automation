"""Build the audit master Markdown + a designed HTML, then print it to PDF with headless Chrome.

Usage: python build_report.py <audit-dir> <kind: product|security>
No third-party packages: a small Markdown subset converter lives below
(headings, paragraphs, lists, tables, code, quotes, links, bold/italic).
"""
import html
import os
import re
import subprocess
import sys

AUDIT_DATE = "20 November 2026"
PRODUCT = "Clinicoro"

KINDS = {
    "product": {
        "title": "SaaS Product Audit",
        "subtitle": "Product, market, competitors, pricing, valuation and growth strategy",
        "base": "SaaS_Product_Audit_Report",
        "files": [f for f in [
            "00-executive-summary.md", "01-product-strategy.md", "02-feature-inventory.md", "03-ui-ux-audit.md",
            "04-technical-audit.md", "05-market-research.md", "06-competitor-analysis.md", "07-feature-gap-analysis.md",
            "08-remove-simplify.md", "09-differentiation-strategy.md", "10-pricing-monetization.md",
            "11-valuation-and-sale.md", "12-customer-validation.md", "13-go-to-market.md", "14-product-roadmap.md",
            "15-implementation-backlog.md", "16-final-verdict.md", "17-research-sources.md"]],
        "accent": "#0E7C78",
        "kpis": [("Overall rating", "5.1 / 10"), ("Stage", "Late MVP"), ("Recommendation", "Continue · paid pilots")],
        "disclaimer": "Market figures, competitor prices and valuations are estimates drawn from third-party sources dated in the Research Sources chapter. They are uncertain (treat valuations as ±50%) and are not financial advice.",
    },
    "security": {
        "title": "SaaS Security Audit",
        "subtitle": "Application security assessment and remediation plan",
        "base": "SaaS_Security_Audit_Report",
        "files": [
            "00-executive-summary.md", "01-attack-surface.md", "02-authentication-audit.md", "03-authorization-and-idor.md",
            "04-api-security.md", "05-database-security.md", "06-token-and-session-security.md",
            "07-input-and-output-security.md", "08-rate-limiting-and-abuse.md", "09-file-upload-and-storage.md",
            "10-business-logic-security.md", "11-infrastructure-and-secrets.md", "12-dependency-security.md",
            "13-privacy-and-data-protection.md", "15-vulnerability-register.md", "14-security-test-matrix.md",
            "16-remediation-roadmap.md", "17-final-security-verdict.md", "18-research-sources.md"],
        "accent": "#B4232B",
        "kpis": [("Verdict", "HIGH RISK"), ("Security score", "5.0 / 10"), ("Findings", "1 C · 3 H · 7 M · 5 L")],
        "disclaimer": "Static assessment of the repository. No live exploitation, no production access, no signed-in dynamic testing. Areas marked NOT TESTED were not verified. This is not legal advice.",
    },
}

SEV = {"critical": "sev-critical", "high": "sev-high", "medium": "sev-medium", "low": "sev-low",
       "informational": "sev-info", "info": "sev-info", "pass": "st-pass", "fail": "st-fail",
       "partial": "st-partial", "not tested": "st-nt", "n/a": "st-nt", "must fix": "sev-high",
       "must fix first": "sev-critical", "must build": "sev-medium", "p0": "sev-critical", "p1": "sev-high",
       "p2": "sev-medium", "p3": "sev-low", "reject": "st-nt", "defer": "st-nt", "nice": "sev-low"}


def inline(text: str) -> str:
    code_spans = []

    def keep(m):
        code_spans.append(m.group(1))
        return f"\u0000{len(code_spans) - 1}\u0000"

    text = re.sub(r"`([^`]+)`", keep, text)
    text = html.escape(text, quote=False)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: link(m.group(1), m.group(2)), text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<em>\1</em>", text)
    text = re.sub(r"\u0000(\d+)\u0000", lambda m: f"<code>{html.escape(code_spans[int(m.group(1))])}</code>", text)
    return text


def link(label: str, href: str) -> str:
    if href.startswith("http"):
        return f'<a href="{html.escape(href)}">{label}</a>'
    return f"<span class=\"xref\">{label}</span>"  # internal file links: text only in the PDF


def badge_cell(raw: str) -> str:
    plain = re.sub(r"[*`]", "", raw).strip()
    key = plain.lower()
    for k in sorted(SEV, key=len, reverse=True):
        if key == k or key.startswith(k + " ") or key.startswith(k + " (") or key.startswith(k + ":"):
            if len(plain) <= 40:
                long = " long" if len(plain) > 14 else ""
                return f'<span class="badge {SEV[k]}{long}">{html.escape(plain)}</span>'
    return inline(raw)


def md_to_html(md: str, chapter_ids: list) -> str:
    lines = md.split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            out.append(f"<pre>{html.escape(chr(10).join(buf))}</pre>")
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1:
                cid = f"ch{len(chapter_ids) + 1}"
                chapter_ids.append((cid, re.sub(r"[*`]", "", text)))
                out.append(f'<h1 id="{cid}" class="chapter">{inline(text)}</h1>')
            else:
                out.append(f"<h{level}>{inline(text)}</h{level}>")
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|\s*$", lines[i + 1]):
            header = [c.strip() for c in line.strip().strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            cls = "wide" if len(header) >= 7 else ""
            t = [f'<table class="{cls}"><thead><tr>' + "".join(f"<th>{inline(h)}</th>" for h in header) + "</tr></thead><tbody>"]
            for r in rows:
                t.append("<tr>" + "".join(f"<td>{badge_cell(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table>")
            out.append("".join(t))
            continue
        if re.match(r"^\s*([-*]|\d+\.)\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.", line))
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines) and re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                item = re.sub(r"^\s*([-*]|\d+\.)\s+", "", lines[i])
                i += 1
                while i < len(lines) and lines[i].startswith("   ") and lines[i].strip() and not re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                    item += " " + lines[i].strip()
                    i += 1
                items.append(f"<li>{inline(item)}</li>")
            out.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue
        if line.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip("> ").rstrip())
                i += 1
            out.append(f"<blockquote>{inline(' '.join(buf))}</blockquote>")
            continue
        if re.match(r"^\s*(---|\*\*\*)\s*$", line):
            out.append("<hr/>")
            i += 1
            continue
        if not line.strip():
            i += 1
            continue
        buf = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||```|>|\s*([-*]|\d+\.)\s)", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(buf))}</p>")
    return "\n".join(out)


CSS = """
@page { size: A4; margin: 20mm 16mm 20mm 16mm;
  @top-left { content: "%(product)s · %(title)s"; font: 8pt 'Segoe UI', Arial; color: #6b7785; }
  @top-right { content: "%(date)s"; font: 8pt 'Segoe UI', Arial; color: #6b7785; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt 'Segoe UI', Arial; color: #6b7785; }
  @bottom-left { content: "Confidential: prepared for the product owner"; font: 8pt 'Segoe UI', Arial; color: #9aa4ae; } }
@page cover { margin: 0; @top-left { content: none } @top-right { content: none } @bottom-right { content: none } @bottom-left { content: none } }
* { box-sizing: border-box; }
body { font: 9.6pt/1.5 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #18232e; margin: 0; }
.cover { page: cover; height: 297mm; padding: 34mm 22mm 24mm; display: flex; flex-direction: column; justify-content: space-between;
  background: linear-gradient(160deg, %(accent)s 0%%, #0b2740 78%%); color: #fff; page-break-after: always; }
.cover .eyebrow { letter-spacing: .18em; text-transform: uppercase; font-size: 9pt; opacity: .8; }
.cover h1 { font-size: 36pt; line-height: 1.1; margin: 10mm 0 4mm; font-weight: 700; }
.cover .sub { font-size: 13pt; opacity: .9; max-width: 140mm; }
.kpis { display: flex; gap: 6mm; margin-top: 14mm; }
.kpi { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); border-radius: 4mm; padding: 5mm 6mm; flex: 1; }
.kpi .k { font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; opacity: .8; }
.kpi .v { font-size: 15pt; font-weight: 700; margin-top: 1.5mm; }
.cover .meta { font-size: 9.5pt; opacity: .9; line-height: 1.7; }
.cover .disc { font-size: 8pt; opacity: .75; max-width: 150mm; margin-top: 4mm; }
.toc { page-break-after: always; }
.toc h2 { font-size: 18pt; color: #0b2740; border: 0; margin: 0 0 6mm; }
.toc ol { list-style: none; padding: 0; margin: 0; counter-reset: c; }
.toc li { display: flex; align-items: baseline; padding: 2mm 0; border-bottom: 1px dotted #c9d2da; font-size: 10.5pt; }
.toc li a { color: #18232e; text-decoration: none; flex: 1; }
.toc li .pg { color: #6b7785; font-variant-numeric: tabular-nums; margin-left: 4mm; }
h1.chapter { page-break-before: always; font-size: 19pt; color: #0b2740; margin: 0 0 4mm; padding-bottom: 2.5mm; border-bottom: 2.5px solid %(accent)s; }
h2 { font-size: 13pt; color: #0b2740; margin: 6mm 0 2mm; page-break-after: avoid; }
h3 { font-size: 11pt; color: %(accent)s; margin: 5mm 0 1.5mm; page-break-after: avoid; }
h4 { font-size: 10pt; margin: 4mm 0 1mm; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm 5mm; padding-left: 4mm; } li { margin: .6mm 0; }
a { color: %(accent)s; text-decoration: none; border-bottom: .5px solid currentColor; }
code { font: 8.4pt Consolas, 'Courier New', monospace; background: #eef2f5; padding: .2mm 1mm; border-radius: 1mm; word-break: break-word; }
pre { font: 8pt/1.4 Consolas, 'Courier New', monospace; background: #f4f7f9; border: 1px solid #dde4ea; border-radius: 2mm; padding: 3mm; white-space: pre-wrap; page-break-inside: avoid; }
blockquote { margin: 3mm 0; padding: 3mm 4mm; background: #f2f8f7; border-left: 3px solid %(accent)s; border-radius: 1mm; }
table { width: 100%%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.2pt; page-break-inside: auto; }
table.wide { font-size: 7.4pt; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background: #0b2740; color: #fff; text-align: left; padding: 1.6mm 1.8mm; font-weight: 600; vertical-align: bottom; }
td { padding: 1.4mm 1.8mm; border-bottom: 1px solid #e3e8ed; vertical-align: top; overflow-wrap: break-word; hyphens: auto; }
th { hyphens: auto; }
.badge.long { white-space: normal; }
tbody tr:nth-child(even) td { background: #f7f9fb; }
.badge { display: inline-block; padding: .3mm 1.8mm; border-radius: 3mm; font-weight: 700; font-size: 7.4pt; white-space: nowrap; }
.sev-critical { background: #7f1d1d; color: #fff; } .sev-high { background: #dc2626; color: #fff; }
.sev-medium { background: #f59e0b; color: #1f1300; } .sev-low { background: #0ea5e9; color: #fff; } .sev-info { background: #94a3b8; color: #fff; }
.st-pass { background: #dcfce7; color: #166534; } .st-fail { background: #fee2e2; color: #991b1b; }
.st-partial { background: #fef3c7; color: #92400e; } .st-nt { background: #e5e7eb; color: #374151; }
.xref { font-weight: 600; }
hr { border: 0; border-top: 1px solid #dde4ea; margin: 4mm 0; }
"""


def build(audit_dir: str, kind: str) -> None:
    cfg = KINDS[kind]
    parts = []
    for name in cfg["files"]:
        with open(os.path.join(audit_dir, name), encoding="utf-8") as f:
            parts.append(f.read().strip())
    master_md = (
        f"# {PRODUCT} — {cfg['title']} report\n\n"
        f"**Audit date:** {AUDIT_DATE} · **Product:** {PRODUCT} (wacrm fork) · **Prepared for:** product owner\n\n"
        f"> {cfg['disclaimer']}\n\n"
        "This master document combines the individual reports in this folder, in reading order.\n\n"
        + "\n\n".join(parts) + "\n"
    )
    md_path = os.path.join(audit_dir, cfg["base"] + ".md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(master_md)

    chapters = []
    bodies = [md_to_html(part, chapters) for part in parts]
    kpis = "".join(f'<div class="kpi"><div class="k">{html.escape(k)}</div><div class="v">{html.escape(v)}</div></div>' for k, v in cfg["kpis"])
    css = CSS % {"product": PRODUCT, "title": cfg["title"], "date": AUDIT_DATE, "accent": cfg["accent"]}
    tools_dir = os.path.join(audit_dir, "tools")
    os.makedirs(tools_dir, exist_ok=True)

    def page_doc(n_chapters, numbers):
        toc = "".join(
            f'<li><a href="#{cid}">{html.escape(t)}</a><span class="pg">{numbers[k] if numbers else "00"}</span></li>'
            for k, (cid, t) in enumerate(chapters))
        return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{PRODUCT} {cfg['title']}</title>
<style>{css}</style></head><body>
<section class="cover"><div><div class="eyebrow">{PRODUCT} · Confidential</div><h1>{cfg['title']}</h1>
<div class="sub">{cfg['subtitle']}</div><div class="kpis">{kpis}</div></div>
<div><div class="meta"><strong>Product:</strong> {PRODUCT} (WhatsApp front desk for clinics, built on the wacrm template)<br/>
<strong>Audit date:</strong> {AUDIT_DATE}<br/><strong>Repository:</strong> whatsapp_automation · branch feat/migrations-and-booking</div>
<div class="disc">{html.escape(cfg['disclaimer'])}</div></div></section>
<section class="toc"><h2>Contents</h2><ol>{toc}</ol></section>
{chr(10).join(bodies[:n_chapters])}
</body></html>"""

    chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

    def print_pdf(doc, out_pdf):
        html_path = os.path.join(tools_dir, cfg["base"] + ".html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(doc)
        subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={os.path.abspath(out_pdf)}",
                        "file:///" + os.path.abspath(html_path).replace("\\", "/")],
                       check=True, timeout=180, capture_output=True)
        with open(out_pdf, "rb") as f:
            return len(re.findall(rb"/Type\s*/Page[^s]", f.read()))

    # Chrome has no target-counter(): find each chapter's first page by printing
    # the document up to the chapter before it (every chapter starts a new page).
    tmp_pdf = os.path.join(tools_dir, "_measure.pdf")
    numbers = []
    for k in range(len(chapters)):
        numbers.append(print_pdf(page_doc(k, None), tmp_pdf) + 1 if k else 3)
    os.remove(tmp_pdf)
    pdf_path = os.path.abspath(os.path.join(audit_dir, cfg["base"] + ".pdf"))
    total = print_pdf(page_doc(len(chapters), numbers), pdf_path)
    print("pages", total, "chapter starts", numbers)
    print("wrote", md_path, pdf_path)


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
