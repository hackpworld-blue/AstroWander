/* Descriptive content: planets, the Sun and Moon, notable stars, object-type glossary. */

window.PLANET_INFO = {
  Sun: {
    kind: 'star', symbol: '☉', tone: '#FFCF57',
    tagline: 'The G-type main-sequence star at the centre of everything here.',
    facts: [
      ['Diameter', '1,391,000 km — 109 Earths across'],
      ['Spectral type', 'G2V'],
      ['Surface temp', '5,778 K (photosphere)'],
      ['Core temp', '~15.7 million K'],
      ['Age', '~4.6 billion years'],
      ['Distance', '1 AU — 8 minutes 20 seconds at light speed']
    ],
    text: 'The Sun holds 99.86% of the mass of the solar system. Hydrogen fuses to helium in its core at roughly 600 million tonnes per second, and the energy released takes tens of thousands of years to random-walk out to the photosphere — then eight minutes to reach you. It is about halfway through its main-sequence life.',
    warn: 'Never point optics — or your unshielded eye — at the Sun. This app will not help you observe it.'
  },
  Moon: {
    kind: 'moon', symbol: '☾', tone: '#D8D3C4',
    tagline: 'Earth’s only natural satellite, and the one object where you can see surface detail unaided.',
    facts: [
      ['Diameter', '3,475 km — about a quarter of Earth’s'],
      ['Mean distance', '384,400 km (1.28 light-seconds)'],
      ['Orbital period', '27.3 days (sidereal)'],
      ['Phase cycle', '29.5 days (synodic)'],
      ['Surface gravity', '1.62 m/s² — one sixth of Earth’s'],
      ['Temperature', '−173 °C to 127 °C']
    ],
    text: 'The Moon is tidally locked, so the same hemisphere always faces us. Its dark plains — the maria — are basalt floods that filled giant impact basins around three billion years ago; the bright highlands are older, heavily cratered crust. It is receding from Earth by about 3.8 cm a year.',
    obs: 'The terminator — the line between lit and unlit — is where craters throw long shadows. A few days either side of first or last quarter shows far more detail than a full Moon, which is flatly lit and glaring.'
  },
  Mercury: {
    kind: 'planet', symbol: '☿', tone: '#A89684',
    tagline: 'The smallest planet, and the hardest of the classical five to catch.',
    facts: [
      ['Diameter', '4,879 km'],
      ['Mass', '0.055 Earths'],
      ['Year', '88 Earth days'],
      ['Solar day', '176 Earth days'],
      ['Moons', 'None'],
      ['Temperature', '−173 °C to 427 °C']
    ],
    text: 'Mercury has almost no atmosphere, so its day side roasts and its night side plunges — the widest surface temperature swing of any planet. It is dense and disproportionately metallic: an oversized iron core under a thin rocky shell, probably the remains of a larger body stripped by a giant impact. Radar has found water ice sitting in polar craters that never see sunlight.',
    obs: 'Never more than 28° from the Sun, so it appears only in bright twilight low to the horizon. Look within about 45 minutes of sunset or before sunrise, during a greatest-elongation window.'
  },
  Venus: {
    kind: 'planet', symbol: '♀', tone: '#EBD9A8',
    tagline: 'The brightest planet — the morning and evening star.',
    facts: [
      ['Diameter', '12,104 km'],
      ['Mass', '0.815 Earths'],
      ['Year', '224.7 Earth days'],
      ['Rotation', '243 Earth days, retrograde'],
      ['Moons', 'None'],
      ['Surface', '464 °C at 92 bar']
    ],
    text: 'Venus is Earth-sized and nothing like Earth. A runaway greenhouse under 96% carbon dioxide holds the surface at 464 °C — hot enough to melt lead, and hotter than Mercury despite being further out. The pressure at ground level matches a kilometre underwater. It rotates backwards, and so slowly that its day is longer than its year.',
    obs: 'At peak it reaches magnitude −4.9, bright enough to cast shadows and to be seen in daylight if you know exactly where to look. Through even a small telescope it shows phases like the Moon — the observation that helped Galileo argue for a Sun-centred system.'
  },
  Mars: {
    kind: 'planet', symbol: '♂', tone: '#C1613C',
    tagline: 'The rusted desert world, and the one whose surface you can actually resolve.',
    facts: [
      ['Diameter', '6,779 km'],
      ['Mass', '0.107 Earths'],
      ['Year', '687 Earth days'],
      ['Day', '24 h 37 m'],
      ['Moons', '2 — Phobos and Deimos'],
      ['Temperature', '−140 °C to 20 °C']
    ],
    text: 'The colour is iron oxide dust. Mars carries the tallest volcano in the solar system — Olympus Mons, 21 km high — and Valles Marineris, a canyon system that would run from New York to Los Angeles. Its atmosphere is 1% of Earth’s, almost all CO₂. Ancient river valleys, deltas and lakebeds show it once had liquid water on the surface.',
    obs: 'Worth observing near opposition, roughly every 26 months, when it can outshine Jupiter. Between oppositions it shrinks to a small featureless dot. At a good opposition a modest telescope shows polar caps and dark surface markings.'
  },
  Jupiter: {
    kind: 'planet', symbol: '♃', tone: '#D9A566',
    tagline: 'The giant — more massive than everything else orbiting the Sun combined.',
    facts: [
      ['Diameter', '139,820 km — 11 Earths across'],
      ['Mass', '317.8 Earths'],
      ['Year', '11.86 Earth years'],
      ['Day', '9 h 56 m — fastest in the solar system'],
      ['Moons', '95+ confirmed'],
      ['Cloud tops', '−145 °C']
    ],
    text: 'Jupiter is mostly hydrogen and helium with no solid surface to land on. It spins so fast that it is visibly flattened at the poles. The Great Red Spot is a storm wider than Earth that has been running for at least 190 years and is slowly shrinking. Its four large moons — Io, Europa, Ganymede and Callisto — include a volcanic world and two with subsurface oceans.',
    obs: 'The Galilean moons are visible in binoculars, and their positions shift visibly within a single evening. A small telescope shows the two main equatorial cloud belts.'
  },
  Saturn: {
    kind: 'planet', symbol: '♄', tone: '#E0C98D',
    tagline: 'The ringed planet — the sight that converts people to astronomy.',
    facts: [
      ['Diameter', '116,460 km'],
      ['Mass', '95.2 Earths'],
      ['Year', '29.4 Earth years'],
      ['Day', '10 h 42 m'],
      ['Moons', '140+ confirmed'],
      ['Cloud tops', '−178 °C']
    ],
    text: 'The rings span about 280,000 km but average only around 10 metres thick — almost pure water ice, from boulder-sized down to dust, shepherded by small moons. They are probably young, perhaps only 100 million years old, and are slowly raining into the planet. Saturn’s mean density is less than water. Its moon Titan has a thick nitrogen atmosphere and lakes of liquid methane.',
    obs: 'The rings are visible in almost any telescope at 30× or more. Their tilt changes over Saturn’s 29-year orbit — they open out, then close to a nearly invisible edge-on line, then open the other way.'
  },
  Uranus: {
    kind: 'planet', symbol: '♅', tone: '#9AD3D8',
    tagline: 'An ice giant tipped almost entirely on its side.',
    facts: [
      ['Diameter', '50,724 km'],
      ['Mass', '14.5 Earths'],
      ['Year', '84 Earth years'],
      ['Day', '17 h 14 m, retrograde'],
      ['Axial tilt', '98°'],
      ['Moons', '28 known']
    ],
    text: 'Uranus rotates on its side, almost certainly knocked there by a massive early collision. Each pole gets 42 years of continuous sunlight followed by 42 years of dark. Under the hydrogen-helium atmosphere is a hot, dense fluid of water, methane and ammonia — the “ice” that names the class. Methane absorbs red light, leaving the pale cyan colour. Only one spacecraft, Voyager 2 in 1986, has ever visited.',
    obs: 'At magnitude 5.7 it is just at the edge of naked-eye visibility from a truly dark site, and easy in binoculars once you know where to point. It was the first planet discovered with a telescope — William Herschel, 1781.'
  },
  Neptune: {
    kind: 'planet', symbol: '♆', tone: '#5C7FD6',
    tagline: 'The outermost planet, and the windiest place known.',
    facts: [
      ['Diameter', '49,244 km'],
      ['Mass', '17.1 Earths'],
      ['Year', '164.8 Earth years'],
      ['Day', '16 h 6 m'],
      ['Moons', '16 known'],
      ['Winds', 'up to 2,100 km/h']
    ],
    text: 'Neptune was found by mathematics before it was found by telescope: irregularities in Uranus’s orbit predicted its position, and it was spotted within a degree of the prediction in 1846. It radiates more heat than it receives from the Sun. Its largest moon, Triton, orbits backwards — a captured Kuiper Belt object — and has nitrogen geysers.',
    obs: 'Magnitude 7.8 — telescope or good binoculars only, and it looks like a faint star. At high magnification it shows a tiny blue-grey disc. It completed its first full orbit since discovery in 2011.'
  },
  Pluto: {
    kind: 'dwarf', symbol: '♇', tone: '#B3A08C',
    tagline: 'Dwarf planet, Kuiper Belt object, and still worth arguing about.',
    facts: [
      ['Diameter', '2,377 km'],
      ['Mass', '0.0022 Earths'],
      ['Year', '248 Earth years'],
      ['Day', '6.4 Earth days'],
      ['Moons', '5 — Charon, Styx, Nix, Kerberos, Hydra'],
      ['Temperature', '−233 °C']
    ],
    text: 'New Horizons flew past in 2015 and found a far more active world than anyone expected: nitrogen-ice glaciers flowing across a young, crater-free plain, water-ice mountains 3 km high, and a layered blue haze. Pluto and Charon are close enough in mass that they orbit a point outside Pluto’s surface — a genuine double system.',
    obs: 'Magnitude 14 — a serious telescope and a good chart, and even then it is an unremarkable point you identify by watching it move over several nights.'
  }
};

/* Notable stars, keyed by proper name as it appears in the catalogue. */
window.STAR_LORE = {
  Sirius: 'The brightest star in the night sky, and close — 8.6 light-years. Its brilliance is mostly proximity: it is only about 25 times the Sun’s luminosity. Sirius has a white dwarf companion, Sirius B, inferred from a wobble long before it was ever seen. Low in the sky it flashes violently through every colour, which is atmospheric scintillation, not the star.',
  Canopus: 'The second-brightest star, and a genuine heavyweight — roughly 10,000 times the Sun’s output at 310 light-years. Long used as a navigation reference by spacecraft precisely because it is bright and far from the ecliptic. Invisible north of about 37° N.',
  Arcturus: 'An orange giant 37 light-years away, moving fast and steeply to the galactic plane — it belongs to an older population of stars passing through our neighbourhood. Its light was used to open the 1933 Chicago World’s Fair, focused onto a photocell.',
  'Rigil Kentaurus': 'Alpha Centauri A, the nearest bright star system at 4.37 light-years, and a near twin of the Sun. With Alpha Centauri B and the faint red dwarf Proxima it forms a triple system. Proxima — slightly closer still — hosts a planet in its habitable zone.',
  Vega: 'A brilliant white star 25 light-years away, and a former pole star — precession will make it so again around 13,700 CE. Vega was the zero point of the magnitude system by definition, and the first star ever photographed. It is surrounded by a debris disc.',
  Capella: 'Looks like one golden star, but is four: two yellow giants in a close pair, plus a distant red dwarf binary. At 43 light-years it is the closest bright yellow giant system.',
  Rigel: 'A blue supergiant roughly 860 light-years away and about 120,000 times the Sun’s luminosity. Despite being Beta Orionis, it usually outshines Betelgeuse. It is a strong supernova candidate on astronomical timescales.',
  Procyon: 'Eleven light-years away, and — like Sirius — bright mostly because it is near. It too has a white dwarf companion. With Sirius and Betelgeuse it forms the Winter Triangle.',
  Achernar: 'The flattest known star: it spins so fast, near 250 km/s at the equator, that its equatorial diameter is around 50% greater than its polar diameter. It marks the end of the river Eridanus.',
  Betelgeuse: 'A red supergiant so large that, placed at the Sun, it would swallow the orbit of Jupiter. It is visibly variable, and its dramatic 2019–20 dimming turned out to be a dust cloud ejected by the star. It will go supernova — sometime in the next 100,000 years.',
  Hadar: 'Beta Centauri, a triple system of hot blue giants about 390 light-years away. With Alpha Centauri it forms the pointers to the Southern Cross.',
  Altair: 'Seventeen light-years away and rotating once every nine hours — fast enough to be measurably oval. It is the eagle’s eye in Aquila and a corner of the Summer Triangle.',
  Aldebaran: 'An orange giant 65 light-years away that appears to sit in the Hyades cluster but is actually less than half as distant — a chance alignment. It is the eye of Taurus, glaring at Orion.',
  Antares: 'A red supergiant whose name means “rival of Mars” — both are conspicuously red and they pass close in the sky. It is around 700 times the Sun’s diameter, and sits in a cloud of its own ejected material.',
  Spica: 'Two enormous blue stars orbiting each other every four days, so close that tides distort both into eggs. Hipparchus used Spica’s position to discover the precession of the equinoxes.',
  Pollux: 'The nearest giant star to the Sun at 34 light-years, and host to a confirmed planet roughly twice Jupiter’s mass. Brighter than Castor, despite being Beta Geminorum.',
  Fomalhaut: 'Twenty-five light-years away, ringed by a sharp-edged dust belt that was imaged directly by Hubble. Sits alone in an empty stretch of autumn sky — hence the nickname the Lonely One.',
  Deneb: 'One of the most luminous stars visible to the naked eye — roughly 200,000 times the Sun, seen across something like 2,600 light-years. If it sat where Sirius does it would cast shadows at noon.',
  Mimosa: 'Beta Crucis, a hot blue giant in the Southern Cross and one of the hottest stars visible unaided, at around 27,000 K.',
  Regulus: 'The heart of the lion, and almost exactly on the ecliptic — so the Moon and planets pass close to it regularly. It spins near its break-up speed and is markedly oblate.',
  Adhara: 'The brightest source of extreme-ultraviolet light in the sky as seen from Earth. Around five million years ago it passed within 34 light-years of us and would have been by far the brightest star in the sky, at magnitude −3.99.',
  Castor: 'A six-star system: three binaries bound together. To the naked eye, one star; through a telescope, a fine close double.',
  Gacrux: 'The nearest red giant to the Sun at 88 light-years, and the top of the Southern Cross. Its deep orange contrasts sharply with the Cross’s blue-white stars.',
  Bellatrix: 'The Amazon Star, marking Orion’s left shoulder. A hot blue giant about 250 light-years away.',
  Elnath: 'Shared between two constellations historically — the tip of Taurus’s northern horn, and once also the charioteer’s foot in Auriga.',
  Miaplacidus: 'Second-brightest star in Carina, the keel of the ship Argo. Its name mixes Arabic and Latin roughly as “placid waters”.',
  Alnilam: 'The central star of Orion’s Belt, and a blue supergiant around 2,000 light-years away — one of the most luminous stars known.',
  Alnitak: 'The eastern star of Orion’s Belt, a triple system. The Horsehead Nebula is silhouetted against gas that Alnitak lights up.',
  Mintaka: 'The western star of Orion’s Belt, and within a quarter degree of the celestial equator — it rises almost due east and sets almost due west from anywhere on Earth.',
  Alioth: 'The brightest star of Ursa Major, at the base of the Plough’s handle. A peculiar star with an unusually strong magnetic field.',
  Dubhe: 'The upper pointer of the Big Dipper. Draw a line from Dubhe through Merak and extend it five times to find Polaris.',
  Merak: 'The lower pointer of the Big Dipper, and a permanent partner to Dubhe in finding north.',
  Mizar: 'The middle star of the Dipper’s handle, paired with faint Alcor — a classic naked-eye eyesight test. Mizar was the first star found to be a telescopic double, and later the first spectroscopic binary. The pair is really six stars.',
  Alcor: 'The faint companion to Mizar, about 12 arcminutes away. Seeing the two separately has been used as a vision test for centuries.',
  Polaris: 'The current North Star, within about 0.7° of the celestial pole — so it barely moves while everything else wheels around it. Its altitude equals your latitude. Precession will hand the job to other stars and return it here in roughly 26,000 years.',
  Thuban: 'The pole star of ancient Egypt, around 2700 BCE — the descending passage of the Great Pyramid points at where it then sat.',
  Algol: 'The Demon Star. Every 2.87 days a dim companion eclipses the bright primary and Algol fades by more than a magnitude over a few hours — visible to the naked eye, and almost certainly noticed in antiquity.',
  Mira: 'The prototype long-period variable. Over about 332 days it swings between naked-eye brightness and complete invisibility. It is shedding material and trails a 13-light-year tail behind it.',
  Alphard: 'The Solitary One — an orange giant conspicuous mostly because the surrounding region of Hydra is so empty.',
  Alphecca: 'The jewel of the Northern Crown, an eclipsing binary with a dust disc around the secondary.',
  Alpheratz: 'The shared corner between Andromeda and the Great Square of Pegasus — formally Alpha Andromedae, though it draws the Square’s northeast corner.',
  Rasalhague: 'The head of the serpent-bearer Ophiuchus, the thirteenth constellation the ecliptic actually passes through.',
  Sadr: 'The breast of the swan, at the centre of the Northern Cross, embedded in a large emission nebula.',
  Albireo: 'The finest colour-contrast double in the sky: a gold giant beside a blue companion, easily split in a small telescope. Marks the swan’s beak.',
  Shaula: 'The stinger of Scorpius — the name means exactly that. A triple system around 570 light-years away.',
  Nunki: 'One of the few star names of genuinely Babylonian origin, in the handle of the Sagittarius teapot.',
  Menkalinan: 'Beta Aurigae, an eclipsing binary whose two near-identical stars orbit every four days.',
  Atria: 'The brightest star of the Southern Triangle, an orange giant around 390 light-years away.',
  Avior: 'A rare modern naming — invented in the 1930s for a British air almanac because the star needed a name for navigation and had none.',
  Peacock: 'Alpha Pavonis, named in the same 1930s air-almanac exercise as Avior.',
  Alsephina: 'Delta Velorum, a complex multiple system and one of the brightest eclipsing binaries in the sky.',
  Rasalgethi: 'The head of the kneeling Hercules — a red supergiant of enormous size, semi-regularly variable, with a green-tinted companion.'
};

window.DSO_TYPES = {
  gc:  { label: 'Globular cluster', blurb: 'A dense, gravitationally bound sphere of hundreds of thousands of very old stars, orbiting in the galactic halo.' },
  oc:  { label: 'Open cluster', blurb: 'A loose group of young stars born from the same cloud, still drifting together through the galactic disc.' },
  pn:  { label: 'Planetary nebula', blurb: 'The shed outer envelope of a dying Sun-like star, lit from inside by the exposed core. Nothing to do with planets — the name is an eighteenth-century mistake about their round appearance.' },
  snr: { label: 'Supernova remnant', blurb: 'Expanding debris from a star that exploded, still ploughing into the surrounding interstellar medium.' },
  sfr: { label: 'Star-forming region', blurb: 'A cloud of gas and dust actively collapsing into new stars, glowing where young hot stars ionise the surrounding hydrogen.' },
  rn:  { label: 'Reflection nebula', blurb: 'Dust that shines only by scattering light from nearby stars — characteristically blue, for the same reason the sky is.' },
  s:   { label: 'Spiral galaxy', blurb: 'A rotating disc of hundreds of billions of stars with arms of active star formation wound through it.' },
  e:   { label: 'Elliptical galaxy', blurb: 'A smooth, featureless swarm of mostly old stars with little gas left to make new ones — typically the product of past mergers.' },
  i:   { label: 'Irregular galaxy', blurb: 'A galaxy with no clean spiral or elliptical structure, often distorted by a gravitational encounter.' },
  pos: { label: 'Asterism / star field', blurb: 'A recognisable pattern or rich patch of stars rather than a single bound object.' }
};
