// World layout constants (metres). Traffic drives on the LEFT, as in Pakistan.

export const N = 7; // blocks per side; there are N + 1 roads in each direction
export const PITCH = 74; // distance between parallel road centre lines
export const ROAD_W = 14;
export const HALF_ROAD = ROAD_W / 2;
export const WALK_W = 3.5; // footpath width
export const CURB_H = 0.16;
export const LANES = [2.0, 5.0]; // lane-centre offsets from the road centre line
export const MAIN_ROADS = new Set([2, 5]); // roads with a black & yellow median

export const BAY = 3.5; // facade bay width
export const FLOOR_H = 3.2;
export const SHOP_H = 3.8;
export const FACADE_TILE_W = BAY * 4; // one facade texture covers 4 bays x 4 floors
export const FACADE_TILE_H = FLOOR_H * 4;

export const roadCoord = (i) => (i - N / 2) * PITCH;
export const CITY_MIN = roadCoord(0);
export const CITY_MAX = roadCoord(N);

export const LOCALITIES = [
  'Anarkali', 'Liberty Chowk', 'Ichhra', 'Mozang', 'Saddar', 'Raja Bazaar',
  'Gulberg', 'Model Town', 'Shadman', 'Garhi Shahu', 'Qila Gujjar Singh',
  'Bhati Gate', 'Lohari Gate', 'Data Darbar', 'Mall Road', 'Empress Market',
  'Tariq Road', 'Burns Road', 'Lakshmi Chowk', 'Nila Gumbad', 'Hall Road',
  'Mochi Gate', 'Shah Alami', 'Township', 'Faisal Town', 'Johar Town',
  'Samanabad', 'Krishan Nagar', 'Baghbanpura', 'Shalimar', 'Misri Shah',
  'Mughalpura', 'Chauburji', 'Bilal Ganj', 'Sanda', 'Islampura', 'Rang Mahal',
  'Kashmiri Bazaar', 'Urdu Bazaar', 'Beadon Road', 'Regal Chowk', 'Fortress',
  'Dharampura', 'Walton', 'Cavalry Ground', 'Wahdat Road', 'Muslim Town',
  'Canal View', 'Kalma Chowk',
];
