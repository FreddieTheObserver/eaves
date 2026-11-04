# Ready for more languages from day one, English only at launch

The site launches in English only, yet every content type except Inquiry and Slug history has Strapi's internationalization switched on with a single English locale, each field is marked per-language (text, components, and bodies of Blocks) or shared (facts, links between entries, and media where Strapi allows it), and the web app routes through a locale segment in which English has no prefix.
A Bangkok studio would realistically publish in Thai as well, and adding languages later would mean reworking every content type, route, and slug, while doing it now costs little with only one language in play.
Thai can then arrive under `/th/` as translation work, without moving any English URL.
