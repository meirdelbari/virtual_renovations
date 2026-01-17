const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Intelligent Product Scraper
 * Attempts to extract product information (Image, Name, Price) from a given URL.
 */
async function scrapeProducts(url) {
    console.log(`[Scraper] Starting scrape for: ${url}`);
    
    try {
        // 1. Fetch the HTML
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        const html = response.data;
        const $ = cheerio.load(html);
        const products = [];
        const seenImages = new Set();

        // 2. Intelligent Extraction Strategy
        // We look for common e-commerce patterns (cards, grids, product containers)

        // Helper: Clean price string
        const cleanPrice = (str) => {
            if (!str) return null;
            const match = str.match(/[0-9,.]+/);
            return match ? match[0] : null;
        };

        // Strategy A: JSON-LD Structured Data (Best Quality)
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const data = JSON.parse($(el).html());
                const items = Array.isArray(data) ? data : [data];
                
                items.forEach(item => {
                    // Check for single Product
                    if (item['@type'] === 'Product' && item.image) {
                        const img = Array.isArray(item.image) ? item.image[0] : item.image;
                        if (img && !seenImages.has(img)) {
                            products.push({
                                name: item.name,
                                image: img,
                                price: item.offers ? (item.offers.price || item.offers.lowPrice) : null,
                                source: 'json-ld'
                            });
                            seenImages.add(img);
                        }
                    }
                    // Check for ItemList (Category Pages)
                    if (item['@type'] === 'ItemList' && item.itemListElement) {
                         item.itemListElement.forEach(prod => {
                             const p = prod.item || prod; // Sometimes structure varies
                             if (p.image) {
                                 const img = Array.isArray(p.image) ? p.image[0] : p.image;
                                 if(!seenImages.has(img)) {
                                     products.push({
                                         name: p.name,
                                         image: img,
                                         price: null, // Often not in list view LD-JSON
                                         source: 'json-ld-list'
                                     });
                                     seenImages.add(img);
                                 }
                             }
                         });
                    }
                });
            } catch (e) {
                // Ignore parse errors
            }
        });

        // Strategy B: Visual HTML Scrape (Fallback)
        // Look for elements that contain an image AND a price
        if (products.length < 5) {
            // Selectors for common product cards
            const cardSelectors = [
                '.product', '.product-item', '.product-card', '.grid-item', 
                'li.item', '.woocommerce-LoopProduct-link', '.card'
            ];

            $(cardSelectors.join(',')).each((i, el) => {
                const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
                const name = $(el).find('h2, h3, .product-title, .name, .title').first().text().trim();
                const price = $(el).find('.price, .amount, .money').first().text().trim();

                // Basic validation: needs valid image and name
                if (img && name && img.startsWith('http')) {
                    if (!seenImages.has(img)) {
                        products.push({
                            name: name,
                            image: img,
                            price: cleanPrice(price),
                            source: 'html-scrape'
                        });
                        seenImages.add(img);
                    }
                }
            });
        }
        
        // Strategy C: "Dumb" Image Grab (Last Resort)
        // Just grab large images that are likely products
        if (products.length === 0) {
            $('img').each((i, el) => {
                const src = $(el).attr('src');
                const width = $(el).attr('width');
                const height = $(el).attr('height');
                const alt = $(el).attr('alt');

                // Filter for likely product images (skip icons, logos)
                if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
                     // Check if it's reasonably large (if dimensions known)
                     // or just take a gamble if it has a good alt text
                     if (alt && alt.length > 5 && !seenImages.has(src)) {
                         products.push({
                             name: alt, // Use Alt text as name
                             image: src,
                             price: null,
                             source: 'image-fallback'
                         });
                         seenImages.add(src);
                     }
                }
            });
        }

        console.log(`[Scraper] Found ${products.length} products.`);
        return products.slice(0, 12); // Limit to top 12 to save space

    } catch (error) {
        console.error(`[Scraper] Error: ${error.message}`);
        return [];
    }
}

module.exports = { scrapeProducts };