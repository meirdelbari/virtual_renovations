// Debug script: verify whether /products/view pages contain <a data-url="..."> markers
// Run: node scripts/debug_ogen_dataurl.js

(async () => {
  const url = "https://ogenceramica.co.il/products/view/%D7%A8%D7%99%D7%A6%D7%95%D7%A3";
  const res = await fetch(url);
  const html = await res.text();
  console.log("status", res.status, "finalUrl", res.url, "len", html.length);
  console.log("head:", html.slice(0, 200).replace(/\s+/g, " "));

  const re = /<a\b([^>]*\bdata-url=["'][^"']+["'][^>]*)>[\s\S]{0,800}?<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  let count = 0;
  while ((m = re.exec(html)) && count < 5) {
    count++;
    const attrs = (m[1] || "").replace(/\s+/g, " ").slice(0, 220);
    const imgSrc = m[2] || "";
    const dataUrlMatch = (m[1] || "").match(/data-url=["']([^"']+)["']/i);
    console.log("\nMatch", count);
    console.log("attrs:", attrs);
    console.log("imgSrc:", imgSrc);
    console.log("dataUrl:", dataUrlMatch ? dataUrlMatch[1] : "NONE");
  }
  console.log("\nfirstMatches", count);
})();

