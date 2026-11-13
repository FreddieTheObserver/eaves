# Eaves Art Direction

This is the single brief for every seed image, as section 14 of [DESIGN.md](DESIGN.md) requires.
`apps/cms/seed/images.json` stays the source of truth for filenames, alt text, and aspect ratios, and this document adds how each image should look and the prompt that makes it.
Status: draft, not yet piloted.

## 1. What is being made

The seed has 68 images.
An image model makes 60 of them: 8 portraits, 5 Service covers, 34 Project images, 9 Article images, and 4 for the Home page, Studio page, and share image.
The other 8 are drawings (plans, sections, and one elevation), which are drawn as vector linework rather than generated, because image models do not produce credible drawings.

## 2. Rules

These come from [ADR 0002](adr/0002-fictional-content-policy.md) and apply to every image.

- Nothing shows a real, recognisable building, landmark, bridge, skyline, or shop.
- No legible text anywhere: no signage, shop names, logos, brand marks, book titles, or watermarks.
- People are fictional, and no image is prompted with a real person's name or likeness.
- A Project that is a Concept or Under construction is shown as a visualization, never as a finished room, so Hillside House and Noodle Counter use the visualization look in section 4.
- Prompts may say "photograph" to steer the model, but alt text and captions never do.
- Every final file carries the IPTC digital source type for AI-generated media, written by our own script whatever the tool embeds.

## 3. The look

The site sits on the Monsoon palette: a cool green-grey ground with near-black ink and one deep green accent.
The images supply the warmth, so they lean on timber, lime plaster, brick, and terrazzo, and they avoid a green or grey cast of their own.

- Light: natural daylight only, soft and directional, with the deep shade of a tropical afternoon and gentle contrast.
- Camera: eye level, a 35mm look for rooms and a 50mm look for details, straight verticals, calm compositions with empty space.
- Colour: muted and slightly desaturated, warm highlights, neutral shadows, no orange-and-teal grading.
- Materials: oiled timber, lime-washed plaster, soft red-brown brick, pale terrazzo, stainless steel only where the brief says so.
- Mood: lived in but uncluttered, quiet, a little weathered.
- Avoid: wide-angle distortion, HDR glow, lens flare, glossy show-home styling, stock-photo smiles, drones, sunsets.

## 4. Shared prompt blocks

Each prompt is built as: the Project world (section 6), then the scene, then one of these blocks.

**Built** (completed Projects, Services, Articles, Home, Studio):

> Architectural photograph in the manner of a quiet editorial monograph.
> Natural daylight only, soft and directional, tropical light with deep shade and gentle contrast.
> Eye level, 35mm lens look, straight verticals, calm composition with generous empty space.
> Warm natural materials, muted and slightly desaturated colour, warm highlights and neutral shadows.
> Lived in but uncluttered.
> No text, no signage, no logos, no watermark, no people unless stated.

**Visualization** (Hillside House, Noodle Counter):

> Architectural visualization: a clean, softly lit design render that is clearly a rendering and not a photograph.
> Matte materials, simplified detail, no wear or dirt, pale even light, soft shadows.
> Any people are simple, slightly abstract figures.
> Eye level, straight verticals, calm composition.
> No text, no signage, no logos, no watermark.

**Portrait** (Team Members):

> Head and shoulders portrait of a fictional person, facing the camera, relaxed and neutral expression, no posed smile.
> Plain lime-plastered wall in a pale warm grey behind them, slightly uneven.
> Soft window light from the left, 85mm lens look, shallow depth of field.
> Natural skin texture, no retouched gloss, no jewellery, no logos, no text.

## 5. Method

- Tool: Nano Banana Pro through Higgsfield, at 2K, with the aspect ratio from `images.json`.
- Order: generate each Project's cover first and accept it before anything else in that Project.
- References: every other image of a Project passes the accepted cover as a reference image, with the instruction "the same building, materials, and light as the reference".
- Portraits: `team-narin.jpg` is made first, and the other seven pass it as a reference for the wall and light only, with the instruction "a different person".
- Standalone images (Services, Articles, Home, Studio) take no reference in the pilot, and get the Courtyard House cover as a look reference only if they drift from the Project images.
- Attempts: up to four per image, and the reason for each rejection is noted so the prompt can be fixed rather than rerolled.

An image is accepted when all of these hold:

- It matches its alt text in `images.json`, since the alt text is what the site will say about it.
- It matches the other images of its Project in materials, proportions, and light.
- It has no legible text, no recognisable real place, and no warped geometry, hands, or faces.
- It still reads when cropped to its aspect ratio at 390 pixels wide.

After acceptance, each file is saved as a JPEG under its final filename with a long edge of 2400 pixels, and stamped:

```text
exiftool -XMP-iptcExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" file.jpg
```

## 6. Prompt list

Each line gives the filename, its aspect ratio, its reference, and the scene.

### Team Members (Portrait block, 4:5)

- `team-narin.jpg` (no reference): a Thai woman in her fifties with short greying hair, in a grey linen shirt.
- `team-ploy.jpg` (ref: narin): a Thai woman in her forties with shoulder-length dark hair, in a dark jacket.
- `team-krit.jpg` (ref: narin): a Thai man in his forties with short dark hair, in a white shirt.
- `team-mali.jpg` (ref: narin): a Thai woman in her thirties with her hair tied back, in an ochre top.
- `team-thanawat.jpg` (ref: narin): a Thai man in his thirties wearing thin-framed glasses and a navy shirt.
- `team-sirin.jpg` (ref: narin): a Thai woman in her thirties with a short bob, in a striped shirt.
- `team-arun.jpg` (ref: narin): a Thai man in his forties with a trimmed beard, in a dark green shirt.
- `team-nok.jpg` (ref: narin): a Thai woman in her twenties with long dark hair, in a white shirt.

### Services (Built block, 3:2, no reference)

- `service-residential-interior.jpg`: a living room with oiled timber shelves along one wall and lime-washed walls, in soft morning light.
- `service-commercial-interior.jpg`: a pale terrazzo counter in a small shop, with a row of simple stools lined up in front of it.
- `service-architectural.jpg`: a low single-storey house with a deep overhanging roof, its walls entirely in shade, seen from the garden.
- `service-workplace.jpg`: a long shared timber table in a calm office, with daylight coming from tall windows on one side.
- `service-renovation.jpg`: an old, patched plaster wall with a newly opened doorway framed in fresh timber.

### Courtyard House in Ari (Built block, 3:2)

World: a two-storey house of soft red-brown brick on a long, narrow city plot between taller neighbours, wrapped around a small planted court with one frangipani tree and ferns.
A dark oiled timber eave reaches a metre and a half past the wall on one side.
Inside are lime-washed walls, oiled timber, and a pale terrazzo floor poured in one colour.

- `courtyard-house-ari-cover.jpg` (no reference): the brick house seen across the planted court, with the deep timber eave casting a band of shade across the walls.
- `courtyard-house-ari-court.jpg` (ref: cover): the small court at midday, sunlit plants below and the upper floor of the house in shade.
- `courtyard-house-ari-stair.jpg` (ref: cover): an oiled timber stair rising past a lime-washed wall, lit from the side by the court.
- `courtyard-house-ari-kitchen.jpg` (ref: cover): a kitchen with a terrazzo floor and plain timber cabinets, and a window onto the greenery of the court.

### River Apartment in Khlong San (Built block, 3:2)

World: a high-floor apartment whose living space runs the full width of the river side.
One continuous run of mid-tone oiled timber joinery travels along the inner wall and holds books, the kitchen, and wardrobes, so the rooms stay almost empty.
The view is a wide brown river with small boats and a low, hazy far bank, with no bridge or recognisable building.

- `river-apartment-khlong-san-cover.jpg` (no reference): the living room with a wide window onto the river and the timber joinery along one wall.
- `river-apartment-khlong-san-living.jpg` (ref: cover): a low linen sofa facing the full-width window, with the river beyond.
- `river-apartment-khlong-san-bedroom.jpg` (ref: cover): a quiet bedroom with timber panelling and a low bed.
- `river-apartment-khlong-san-study.jpg` (ref: cover): a desk built into the run of timber shelves, with a few books and a lamp.
- `river-apartment-khlong-san-bath.jpg` (ref: cover): a pale stone bathroom with a timber vanity.

### Shophouse Renovation in Talat Noi (Built block, 3:2)

World: an old four-storey shophouse, four metres wide and twenty deep, in a street of similar plain shophouses.
Its old brick walls are patched in lime, the floors are timber, and a new lightwell is cut through the middle of all four floors.
The ground floor keeps its folding timber shutters.

- `shophouse-talat-noi-cover.jpg` (no reference): the narrow shophouse front from the street, with its folding timber shutters standing open.
- `shophouse-talat-noi-lightwell.jpg` (ref: cover): the lightwell seen from the second floor, rising through several floors, with daylight falling down the old brick walls.
- `shophouse-talat-noi-front-room.jpg` (ref: cover): the ground floor room opening onto the street through the folded shutters, seen from inside.
- `shophouse-talat-noi-upper-floor.jpg` (ref: cover): an upper room with patched plaster walls and a timber floor, almost empty.

### Corner Coffee Bar in Ari (Built block, 3:2)

World: a small coffee bar in the ground floor corner unit of a low building on a leafy street.
One long pale terrazzo counter runs the length of the room, and a timber bench follows the shaded wall and turns out onto the pavement.
Folding shutters open the whole corner, with a band of high glass above them.

- `corner-coffee-bar-ari-cover.jpg` (no reference): the coffee bar on its street corner in the morning, with the shutters folded back.
- `corner-coffee-bar-ari-counter.jpg` (ref: cover): the long terrazzo counter with four or five people waiting along it in the morning, unposed, none looking at the camera.
- `corner-coffee-bar-ari-bench.jpg` (ref: cover): the timber bench following the shaded wall and turning out onto the pavement.
- `corner-coffee-bar-ari-facade.jpg` (ref: cover): the corner shopfront with the shutters closed and the band of high glass above them.

### Noodle Counter in Yaowarat (Visualization block, 3:2)

World: a narrow old shopfront reworked into a noodle counter.
The kitchen stays at the front, a plain stainless steel counter wraps around the cooks, and twelve round stools line it.
Timber is used only on the rail where an elbow rests, and the old steel roller shutters are kept.

- `noodle-counter-yaowarat-cover.jpg` (no reference): the shopfront from the street, with the kitchen at the front and the counter of stools behind it.
- `noodle-counter-yaowarat-counter.jpg` (ref: cover): the steel counter wrapping around two cooks at work, looking towards the kitchen.
- `noodle-counter-yaowarat-stools.jpg` (ref: cover): twelve round stools in a row along the counter.
- `noodle-counter-yaowarat-shutters.jpg` (ref: cover): the old steel shutters half raised over the shopfront.

### Lighting Showroom in Sathorn (Built block, 3:2)

World: a showroom kept deliberately dim.
Walls and ceilings are a deep, matt, dark brown-grey plaster, and lamps hang in small groups, each lit softly.
This is the one Project where the light comes from the lamps and not from daylight.

- `lighting-showroom-sathorn-cover.jpg` (no reference): the dim showroom with small groups of lamps glowing against the dark plaster.
- `lighting-showroom-sathorn-gallery.jpg` (ref: cover): the main dark room with hanging lamps at different heights, each lit softly.
- `lighting-showroom-sathorn-samples.jpg` (ref: cover): a table of timber, stone, and fabric samples under a single lamp.
- `lighting-showroom-sathorn-stairwell.jpg` (ref: cover): a stairwell lit by one pendant against a dark plaster wall.

### Two-Floor Office in Silom (Built block, 3:2)

World: an office for a small team on two floors of an older building with tall windows.
The lower floor has long shared timber tables and a pantry, and the upper floor has small quiet rooms, thick curtains, and timber battens.
Daylight comes first, and the electric light is low and warm.

- `office-silom-cover.jpg` (no reference): the lower office floor with long shared tables and daylight from tall windows, with no people.
- `office-silom-meeting.jpg` (ref: cover): a small meeting room lined in vertical timber battens, with a round table and four chairs.
- `office-silom-desks.jpg` (ref: cover): desks turned away from one another beside a heavy floor-length curtain.
- `office-silom-phone-rooms.jpg` (ref: cover): a row of small rooms with glass doors along a quiet corridor.
- `office-silom-pantry.jpg` (ref: cover): the office pantry with a long timber counter.

### Hillside House in Chiang Mai (Visualization block, 3:2)

World: a house for a forested slope, under one long, low roof that follows the hill, with the rooms stepping down beneath it.
A deep overhang shades a terrace along the whole south side, and a rainwater tank sits at the lowest end of the roof.

- `hillside-house-chiang-mai-cover.jpg` (no reference): the long roof stepping down the forested hillside, seen from across the slope.
- `hillside-house-chiang-mai-terrace.jpg` (ref: cover): the terrace in deep shade beneath the long roof, looking along its length.
- `hillside-house-chiang-mai-living.jpg` (ref: cover): the living room with its floor stepping down the slope in two or three broad levels.
- `hillside-house-chiang-mai-roof.jpg` (ref: cover): the rainwater tank at the low end of the long roof.

### Articles (Built block, 3:2, no reference)

- `article-lime-plaster-cover.jpg`: a close view of a lime-plastered wall with a soft, uneven surface, in raking light.
- `article-lime-plaster-detail.jpg`: a lime-washed wall, slightly uneven, in warm afternoon light, with the edge of a timber door frame.
- `article-shade-cover.jpg`: the long shadow of a roof falling across a pale wall.
- `article-shade-diagram.jpg`: a hand-drawn pencil study on tracing paper of a roof's shadow hatched across a site plan, lying on a table, with no legible writing.
- `article-teak-cover.jpg`: a worn teak handrail curving down a stair, close up.
- `article-people-who-build-cover.jpg`: large architectural drawings spread across a table and marked up in red pencil, seen from above, with no legible writing.
- `article-site-visit-cover.jpg`: a single stool on a pavement in the shade of a shopfront.
- `article-site-visit-street.jpg`: a narrow street in the late afternoon, with one shopfront half shuttered.
- `article-quieter-studio-cover.jpg`: a quiet room with material samples and rolled drawings on a long table.

### Home, Studio, and share image (Built block, 3:2, no reference)

- `home-statement.jpg`: a deep timber eave shading a lime-washed wall during heavy rain, with water falling clear of the wall.
- `home-studio-introduction.jpg`: a long studio table with small card models and drawings in daylight, with no people.
- `studio-statement.jpg`: the underside of a timber roof reaching out over a wall, seen from below at an angle.
- `default-share.jpg`: a deep overhanging roof seen from below against a pale sky, composed so that it survives a 1.91:1 crop.

## 7. Drawings

These eight are drawn as vector linework by `apps/cms/scripts/build-drawings.js` and exported to JPEG at 4:3 under their final filenames.
They use near-black lines on a plain pale ground, two line weights, no colour, no dimensions, and no labels other than a north point and a scale bar.
Each must agree with its Project's text and with the generated images.

- `courtyard-house-ari-plan.jpg`: ground floor plan of a long, narrow house arranged around a central court, with the deep eave shown dashed on one side.
- `river-apartment-khlong-san-plan.jpg`: apartment plan with the living space across the river side and one long run of joinery on the inner wall.
- `shophouse-talat-noi-section.jpg`: long section through a four-storey shophouse, four metres by twenty, with the lightwell at its centre.
- `corner-coffee-bar-ari-plan.jpg`: plan of the corner bar, with one long counter and a bench along the shaded side turning onto the pavement.
- `noodle-counter-yaowarat-elevation.jpg`: street elevation of the narrow shopfront with its shutters open.
- `lighting-showroom-sathorn-plan.jpg`: plan of the showroom, with the sample table at the back.
- `office-silom-plan.jpg`: plan of the upper office floor, divided into small quiet rooms.
- `hillside-house-chiang-mai-section.jpg`: section through the sloping site, with rooms stepping down under one long roof and the tank at the low end.
