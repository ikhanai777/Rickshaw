# Rickshaw Wala — رکشہ والا

A 3D auto-rickshaw driving game set in the streets of **Lahore** and **Peshawar**, built with [three.js](https://threejs.org/).
Everything — the city, vehicles, people, textures and sound — is generated procedurally in the browser,
so there are no asset downloads beyond three.js and two Google Fonts.

## Play

It's a static site with no build step. Serve the folder with any web server and open `index.html`:

```bash
npx http-server -p 8080 .    # or: python3 -m http.server 8080
```

Then open <http://localhost:8080>. (Opening the file directly via `file://` won't work, because ES modules need a server.)

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `H` | Horn (hold) |
| `Space` | Handbrake |
| `C` | Camera: chase / driver's seat / high |
| `T` | Time of day: afternoon / golden hour / night / smoggy morning |
| `R` | Put the rickshaw back on the road |
| `Y` | Radio on / off |
| `M` | Mute |
| `P` / `Esc` | Pause |

On phones and tablets, on-screen buttons appear once you start.

## Gameplay

- Pick your **city** (Lahore or Peshawar), your **rickshaw paint** and a **graphics level** on the main menu.
  Your savings are kept per city in the browser.
- **Ram anything, GTA-style.** Hit a car and it gets shoved and spun out of your way. Bikes (and speeding
  rickshaws) tip over, and your rickshaw keeps rolling. Buses and jingle trucks are heavy, so they stop you instead.
  Every driver has something to say about it, and so does your passenger.

- **Sawari (passengers)** wave from the footpath and are marked with green rings and a green arrow on the minimap.
  Stop next to one to pick them up.
- Drive to the **golden beam of light**. The floating arrow above the rickshaw points the way.
  Stop there to drop them off and get paid in rupees.
- Fast, smooth rides earn tips. Crashes, flying over speed breakers and running people off the footpath
  cost you part of the fare and your star rating (plus a Rs 200 *chalan* for bumping a pedestrian).
- The rickshaw runs on **CNG**. When the tank runs low, refuel at the CNG station (the blue dot on the minimap)
  by stopping under the canopy.

## Lahore and Peshawar

| | Lahore | Peshawar |
| --- | --- | --- |
| Landmarks | Minar-e-Pakistan, Badshahi-style mosque, Anarkali & Liberty bazaars, Gawalmandi food street | Ghanta Ghar clock tower, Bala Hisar fort, Mahabat Khan-style mosque, Qissa Khwani & Namak Mandi bazaars, Chapli Kabab street |
| Streets | Plastered shop-houses, arched old-city facades | Carved wooden jharokas, earthy brick, Khyber hills on the horizon |
| Traffic | Corollas, Mehrans, CD70s, donkey carts | More jingle trucks, Datsun pickups and horse-drawn tongas |
| People | Prayer caps, dupattas | Pakol caps, turbans, waistcoats, chadars, shuttlecock burqas |
| Radio | Harmonium over tabla keherwa | Rabab over tabla |

## What's in the city

- Dense shop-houses with rolling shutters, Urdu/English panaflex signboards, awnings, balconies with laundry,
  AC units, black water tanks, rebar sticking out of unfinished roofs, and exposed brick side walls
- Concrete electric poles with tangled overhead wires, transformers and street lights
- Main roads with black-and-yellow painted medians, zebra crossings, potholes and speed breakers
- Minar-e-Pakistan in a park, a Mughal-style red-sandstone mosque, a CNG station, and bazaars
  strung with green-and-white flag bunting
- Left-hand traffic: Corolla-style sedans, Mehran-style hatchbacks, Bolan vans, Ravi pickups,
  truck-art buses, CD70 motorbikes (often carrying a pillion rider), other rickshaws, tongas, donkey carts and
  **jingle trucks** with a painted taj crown, chains of pendants, chasing coloured bulbs and musical horns.
  They turn at the *chowks*, swerve around anything stopped in their lane, and use the horn a lot.
- Pedestrians in shalwar kameez, dupattas and burqas who jump out of your way, plus fruit-cart vendors
- Chai dhabas with charpais and customers, cows and goats on the footpaths, and vendors calling out
  ("Garam garam samosay!", "Chapli kabab, taaza taaza!")
- Kites and cheel birds overhead, drifting clouds, two-stroke exhaust smoke, sparks and dust on impacts,
  bloom and colour grading, and four lighting presets including a sodium-lit night

## Code layout

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, HUD markup and styles, import map for three.js |
| `src/main.js` | Renderer, sky, lighting presets, camera, input and main loop |
| `src/city.js` | Procedural city generation, landmarks and static collision |
| `src/rickshaw.js` | Rickshaw model and the player's three-wheeler physics |
| `src/traffic.js` | Lane-following AI traffic with junction turns, lane changes and honking |
| `src/vehicles.js` | Car, van, pickup, bus and motorbike models |
| `src/people.js` | Animated pedestrians, riders and static crowds |
| `src/missions.js` | Passenger pickups, fares, ratings and dialogue |
| `src/hud.js` | Speedometer, minimap, fare panel and toasts |
| `src/audio.js` | WebAudio synthesis for the engine, horns and effects |
| `src/textures.js` | Canvas-painted textures: asphalt, facades, shopfronts, signs, truck art |
| `src/builder.js` | Geometry batching into per-chunk merged meshes |
| `src/cities.js` | Per-city data: localities, landmarks, signboards, traffic mix, people, dialogue |
| `src/effects.js` | Particles and the post-processing chain (bloom, grade, speed blur) |

## Graphics levels

- **High**: 2048 shadow maps, MSAA, bloom and colour grading. For desktops.
- **Medium**: 1024 shadow maps, bloom and grading, lower resolution. Default on phones and tablets.
- **Low**: no shadows or post-processing, fewer cars. For older phones.
