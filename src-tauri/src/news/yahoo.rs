//! Yahoo Finance news via the `/v1/finance/search` endpoint.
//!
//! The search endpoint returns a `news` array with title, publisher, link,
//! providerPublishTime (unix seconds) and thumbnails. We query several related
//! tickers/indices and merge results, deduping by link. Reuses the REST
//! client's cookie jar + crumb via `get_json`.

use std::collections::HashSet;

use anyhow::Result;

use crate::news::NewsItem;
use crate::yahoo::rest::RestClient;

const SEARCH_URL: &str = "https://query1.finance.yahoo.com/v1/finance/search";

// Query terms whose news feeds are most relevant to NQ/ES futures.
const QUERIES: &[&str] = &["NQ=F", "ES=F", "^NDX", "^GSPC"];

pub async fn fetch_news(rest: &RestClient) -> Result<Vec<NewsItem>> {
    let mut items: Vec<NewsItem> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for q in QUERIES {
        let json = rest
            .get_json(
                SEARCH_URL,
                &[
                    ("q", q),
                    ("newsCount", "20"),
                    ("quotesCount", "0"),
                    ("newsFlag", "true"),
                ],
            )
            .await?;

        let Some(arr) = json.get("news").and_then(|n| n.as_array()) else {
            continue;
        };
        for n in arr {
            let link = n.get("link").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if link.is_empty() || seen.contains(&link) {
                continue;
            }
            let title = n.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if title.is_empty() {
                continue;
            }
            seen.insert(link.clone());
            let publisher = n
                .get("publisher")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let time = n
                .get("providerPublishTime")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let thumbnail = n
                .pointer("/thumbnail/0/url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            items.push(NewsItem {
                title,
                publisher,
                link,
                time,
                thumbnail,
            });
        }
    }

    // Newest first.
    items.sort_by(|a, b| b.time.cmp(&a.time));
    // Cap to a sensible panel length.
    items.truncate(40);
    Ok(items)
}
