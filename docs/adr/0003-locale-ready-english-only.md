# Ready for more languages from day one, English only at launch

The site launches in English only.
Every content type except Inquiry and Slug history has Strapi's internationalization switched on with a single English locale.
Each field is marked per-language (text, components, bodies of Blocks, and links between entries) or shared (facts and media).
The web app routes through a locale segment in which English has no prefix.

A Bangkok studio would realistically publish in Thai as well, and adding languages later would mean reworking every content type, route, and slug, while doing it now costs little with only one language in play.
Thai can then arrive under `/th/` as translation work, without moving any English URL.

Links between entries are per-language because Strapi does not share relations between localized types, as a spike on Strapi 5.61.0 showed.
Each translation therefore sets its own links to the translated entries.
