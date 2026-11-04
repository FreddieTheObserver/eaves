# Hybrid page model instead of a page builder

Projects, Articles, and Services are structured content types with fixed, designed templates.
Their bodies are built from a small fixed set of Blocks, the Home page and Studio page are single entries made of predefined Sections, and plain Pages such as Privacy reuse the same Blocks.
We rejected a free-form page builder, where Editors compose arbitrary pages from layout blocks, because the site's value is its art direction: a builder lets any edit break the design and makes content harder to validate, query, and keep consistent.
A new kind of page or Section is therefore a code change, on purpose.
