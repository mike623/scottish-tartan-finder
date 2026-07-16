# Source Investigation Notes

Early observations from a quick manual/live check. Re-verify before writing production crawler selectors.

## Observed URLs

- Home: `https://www.tartanregister.gov.uk/`
- Search: `https://www.tartanregister.gov.uk/search.aspx`
- A–Z: `https://www.tartanregister.gov.uk/az.aspx`
- A–Z letter example: `https://www.tartanregister.gov.uk/az.aspx?searchString=A`
- Detail example: `https://www.tartanregister.gov.uk/tartanDetails.aspx?ref=14598`
- Image example: `https://www.tartanregister.gov.uk/imageCreation.aspx?height=100&ref=14598&width=100`

## Observed details

- `robots.txt` returned 404 during the quick check on both `https://www.tartanregister.gov.uk/robots.txt` and `https://tartanregister.gov.uk/robots.txt`.
- A–Z pages expose table rows with links like `tartanDetails.aspx?ref=10053`.
- `az.aspx?searchString=A` reported 518 results during the check.
- Image endpoint returned a JPEG for `imageCreation.aspx?height=100&ref=14598&width=100`.
- Copyright page includes a database-rights warning: database rights in the Register rest with the Crown.

## Implementation caution

Do not rely only on these notes. The implementation agent must create a full `docs/source-investigation.md` with selectors, pagination behaviour, terms/copyright review, and crawl-safety decisions before production crawling.
