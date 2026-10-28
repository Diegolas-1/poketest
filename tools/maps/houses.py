# Generates the house interiors' blueprints (web/world/maps/ketchum_house.json,
# pallet_house.json, tea_house.json): the layouts, and the food contract's
# seats (seat, seat_h, table_top) computed from each table. Edit here, then
#   python3 tools/maps/houses.py [ketchum pallet tea] && node tools/maps/validate.mjs
#   node tools/native/bake_interior.mjs <id>
import json, math, os, sys
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../web/world/maps')
R2 = lambda v: round(v * 20) / 20          # the 0.05 grid
R3 = lambda v: round(v, 3)
WALL_D = {'poster': 0.02, 'wall_cabinets': 0.34, 'range_hood': 0.45, 'apron_hook': 0.12, 'curtains': 0.16, 'wall_lamp': 0.22, 'wall_shelf': 0.25, 'menu_board': 0.08,
          'hanging_scroll': 0.05, 'shoji_panel': 0.08, 'notice_board': 0.06, 'framed_picture': 0.05, 'wall_clock': 0.06, 'wall_vent': 0.06, 'door': 0.12}

class BP:
    def __init__(s, **kw):
        s.d = dict(format='pallet-map', version=1, grid=0.05, **kw)
        s.d.setdefault('props', []); s.d.setdefault('walls', []); s.d.setdefault('zones', [])
        s.n = {}
    def pid(s, base):
        s.n[base] = s.n.get(base, 0) + 1
        return f'{base}_{s.n[base]}'
    def prop(s, type, x, z, rot=0, level='ground', **kw):
        p = dict(id=kw.pop('id', None) or s.pid(type), type=type, pos=[R2(x), R2(z)], rot=int(round(rot / 5.0) * 5) % 360, level=level)
        p.update(kw)
        s.d['props'].append(p)
        return p
    # a table with chairs (or cushions) round it; every seat is an Eat usable
    def table(s, kind, x, z, place, seats, table_type='dining_table', size3=None, params=None, seat_type='dining_chair', seat_params=None,
              rot=0, centre=None, lines=None):
        tp = dict(params or {})
        if size3: tp['size3'] = size3
        T = s.prop(table_type, x, z, rot, params=tp)
        w, d, h = size3 or {'dining_table': [1.4, 0.85, 0.74], 'low_table': [1.1, 0.75, 0.33]}[table_type]
        if tp.get('round'): d = w
        cloth = 0.006 if tp.get('cloth') else 0.0
        top_y = h + cloth
        out = []
        for side in seats:
            # side: 'n' 's' 'e' 'w' (+ an offset along the side), or (dx, dz)
            if isinstance(side, str):
                off = 0.0
                if ':' in side: side, off = side.split(':'); off = float(off)
                gap = 0.24 if seat_type == 'dining_chair' else 0.32
                if side == 'n': cx, cz = x + off, z - d / 2 - gap
                elif side == 's': cx, cz = x + off, z + d / 2 + gap
                elif side == 'w': cx, cz = x - w / 2 - gap, z + off
                else: cx, cz = x + w / 2 + gap, z + off
            else: cx, cz = x + side[0], z + side[1]
            cx, cz = R2(cx), R2(cz)
            # facing the table: straight across the nearest edge
            if isinstance(side, str): yaw = {'n': 0.0, 's': math.pi, 'w': math.pi / 2, 'e': -math.pi / 2}[side]
            else: yaw = math.atan2(x - cx, z - cz)
            fx, fz = math.sin(yaw), math.cos(yaw)
            # the plate: in front of him, 0.2 m in from the table's edge
            if tp.get('round'):
                dd = math.hypot(x - cx, z - cz) - w / 2 + 0.2
            else:
                dd = abs((x - cx) * fx + (z - cz) * fz) - (d / 2 if abs(fz) > 0.5 else w / 2) + 0.2
            tx, tz = cx + fx * dd, cz + fz * dd
            sh = 0.46 if seat_type == 'dining_chair' else 0.0
            hip = 0.46 if seat_type == 'dining_chair' else 0.1
            sp = dict(seat_params or {})
            use = {'label': 'Eat', 'food_place': place, 'seat': [R3(cx), hip, R3(cz), R3(yaw)], 'seat_h': sh, 'table_top': [R3(tx), R3(top_y + 0.005), R3(tz)],
                   'lines': lines or ['A place at the table.']}
            p = s.prop(seat_type, cx, cz, math.degrees(yaw), params=sp or None, use=use)
            if not sp: p.pop('params')
            out.append(p)
        return T, out
    def wall(s, id, path, h, mat, openings=(), **kw):
        w = dict(id=id, level='ground', path=path, t=kw.pop('t', 0.2), h=h, mat=mat, openings=list(openings)); w.update(kw)
        s.d['walls'].append(w); return w
    # wall props: their back flat on the face of the wall behind them
    def snap_walls(s):
        for p in s.d['props']:
            if not p or p['type'] not in WALL_D: continue
            d = WALL_D[p['type']]
            pr = p.get('params') or {}
            if 'size3' in pr: d = pr['size3'][1]
            d *= pr.get('scale', 1)
            r = math.radians(p['rot']); fx, fz = round(math.sin(r)), round(math.cos(r))
            x, z = p['pos']; best = None
            for w in s.d['walls']:
                for (ax, az), (bx, bz) in zip(w['path'], w['path'][1:]):
                    if fz and az == bz and min(ax, bx) - 0.1 <= x <= max(ax, bx) + 0.1:
                        face = az + fz * w['t'] / 2; dist = (z - face) * fz
                        if dist > -0.3 and (best is None or dist < best[0]): best = (dist, face)
                    if fx and ax == bx and min(az, bz) - 0.1 <= z <= max(az, bz) + 0.1:
                        face = ax + fx * w['t'] / 2; dist = (x - face) * fx
                        if dist > -0.3 and (best is None or dist < best[0]): best = (dist, face)
            if best is None: print('no wall behind', p['id']); continue
            if fz: p['pos'][1] = round(best[1] + fz * (d / 2 + 0.004), 3)
            else: p['pos'][0] = round(best[1] + fx * (d / 2 + 0.004), 3)
    def save(s):
        s.snap_walls()
        f = os.path.join(OUT, s.d['id'] + '.json')
        txt = json.dumps(s.d, indent=1, ensure_ascii=False)
        open(f, 'w').write(txt + '\n')
        print('wrote', f)

# =====================================================================
# Ash's house (the Ketchums'): terrain.js HOUSES 'red', town.js cottage():
# W 7.2 x D 6.4, the front (+z) door at x +1.75, the big window at x -1.7,
# side windows at z +-1.4, the floor 0.45 over the ground. Local frame = the
# house's (its centre at 0, 0, front toward +z); interior walls on the inside
# of the outer ones (centre lines at +-3.5, +-3.1).
# =====================================================================
def ketchum():
    B = BP(id='ketchum_house', name="Ash's House", kind='interior', bounds=[-3.7, -3.3, 3.7, 3.3])
    B.d['place'] = {'map': 'pallet_town', 'house': 'red', 'at': [-24, -28], 'rot': 6.88,
                    'door': {'use': [1.75, 4.3], 'exit': [1.75, 4.45], 'r': 1.2},
                    'note': 'the red-roofed house (terrain.js HOUSES red): local = the house frame, (0, 0) its centre; the door at (1.75, 3.2)'}
    B.d['palette'] = {
        'boards': {'color': '#c48a58', 'label': 'honey floorboards', 'pattern': 'boards', 'gloss': 0.07},
        'lino': {'color': '#e8c8a0', 'color2': '#f8f2e4', 'label': 'kitchen checks', 'pattern': 'checker', 'gloss': 0.09},
        'paper': {'color': '#f3dfc2', 'color2': '#ebd0ae', 'label': 'cream wallpaper with sprigs', 'pattern': 'wallpaper'},
        'kitchen_wall': {'color': '#f8f0dc', 'label': 'kitchen plaster'},
        'wood_panel': {'color': '#b8805a', 'label': 'wood wainscot'},
        'tile_wain': {'color': '#bfe0d8', 'label': 'mint tiles'},
        'ceiling': {'color': '#f2e6d0', 'label': 'cream ceiling'},
        'room_boards': {'color': '#c8925e', 'label': 'his floorboards', 'pattern': 'boards', 'gloss': 0.06},
        'room_wall': {'color': '#d6e8f2', 'label': 'sky blue plaster'},
        'attic': {'color': '#f4ecda', 'label': 'attic ceiling'},
        'rafter': {'color': '#a8784a', 'label': 'rafters'},
    }
    CH = 2.9
    UP = 3.0
    B.d['levels'] = [{'id': 'ground', 'name': 'Ground floor', 'y': 0}, {'id': 'up', 'name': "Ash's room", 'y': UP}]
    B.d['zones'] = [
        {'id': 'living', 'name': 'Living room', 'level': 'ground', 'poly': [[-3.5, -3.1], [0.2, -3.1], [0.2, 3.1], [-3.5, 3.1]], 'floor': 'boards',
         'ceiling': {'type': 'flat', 'h': CH, 'mat': 'ceiling', 'holes': [[-2.6, -3.0, 0.2, -2.05]], 'well': False}},
        {'id': 'kitchen', 'name': 'Kitchen', 'level': 'ground', 'poly': [[0.2, -3.1], [3.5, -3.1], [3.5, -1.0], [0.2, -1.0]], 'floor': 'lino',
         'ceiling': {'type': 'flat', 'h': CH, 'mat': 'ceiling', 'holes': [[0.2, -3.0, 0.9, -2.05]], 'well': False}},
        # Ash's room under the roof: the whole upstairs but the stairwell, a curved attic ceiling on rafters
        {'id': 'ash_room', 'name': "Ash's room", 'level': 'up', 'poly': [[-3.5, -3.1], [-2.6, -3.1], [-2.6, -2.0], [0.9, -2.0], [0.9, -3.1], [3.5, -3.1], [3.5, 3.1], [-3.5, 3.1]],
         'floor': 'room_boards', 'ceiling': {'type': 'vault', 'axis': 'z', 'spring': 1.25, 'rise': 1.45, 'ribs': 1.2, 'mat': 'attic', 'rib': 'rafter'}},
        {'id': 'dining', 'name': 'Dining and entrance', 'level': 'ground', 'poly': [[0.2, -1.0], [3.5, -1.0], [3.5, 3.1], [0.2, 3.1]], 'floor': 'boards',
         'ceiling': {'type': 'flat', 'h': CH, 'mat': 'ceiling'}},
    ]
    wain = {'h': 0.9, 'mat': 'wood_panel'}
    # the front wall: west to east; the big window (x -1.7) and the door (x 1.75)
    B.wall('w_south', [[-3.5, 3.1], [3.5, 3.1]], CH, 'paper', [
        {'id': 'big_window', 'type': 'window', 'at': 1.8, 'w': 2.2, 'h': 1.6, 'sill': 0.95, 'style': 'grid', 'panes': [4, 3], 'outside': 'garden'},
        {'id': 'front_door', 'type': 'door', 'at': 5.25, 'w': 1.2, 'h': 2.2, 'style': 'panel', 'portal': 'to_town', 'wood': '#f4f1e6'},
    ], wainscot=wain, cornice=True)
    B.wall('w_west', [[-3.5, 3.1], [-3.5, -3.1]], CH, 'paper', [
        {'id': 'win_w1', 'type': 'window', 'at': 1.7, 'w': 0.9, 'h': 1.2, 'sill': 1.25, 'style': 'grid', 'panes': [2, 2], 'outside': 'trees'},
        {'id': 'win_w2', 'type': 'window', 'at': 4.5, 'w': 0.9, 'h': 1.2, 'sill': 1.25, 'style': 'grid', 'panes': [2, 2], 'outside': 'trees'},
    ], wainscot=wain, cornice=True)
    B.wall('w_north_w', [[-3.5, -3.1], [0.2, -3.1]], CH, 'paper', [], wainscot=wain, cornice=True)
    B.wall('w_north_e', [[0.2, -3.1], [3.5, -3.1]], CH, 'kitchen_wall', [], wainscot={'h': 1.45, 'mat': 'tile_wain'}, cornice=True)
    B.wall('w_east', [[3.5, -3.1], [3.5, 3.1]], CH, 'paper', [
        {'id': 'win_e1', 'type': 'window', 'at': 1.7, 'w': 0.9, 'h': 1.2, 'sill': 1.25, 'style': 'grid', 'panes': [2, 2], 'outside': 'garden'},
        {'id': 'win_e2', 'type': 'window', 'at': 4.5, 'w': 0.9, 'h': 1.2, 'sill': 1.25, 'style': 'grid', 'panes': [2, 2], 'outside': 'trees'},
    ], wainscot=wain, cornice=True)
    # upstairs: the knee walls and the gable ends of his room
    gab = {'axis': 'x', 'c': 0, 'half': 3.5, 'rise': 2.1}   # (taller than the vault: its top hides above it)
    for wid, path in (('w_up_s', [[-3.5, 3.1], [3.5, 3.1]]), ('w_up_n', [[3.5, -3.1], [-3.5, -3.1]])):
        ops = [{'id': 'gable_window', 'type': 'window', 'at': 3.5, 'w': 1.0, 'h': 1.05, 'sill': 1.05, 'style': 'grid', 'panes': [2, 2], 'outside': 'garden'}] if wid == 'w_up_s' else []
        B.wall(wid, path, 1.25, 'room_wall', ops, level='up', gable=dict(gab))
    B.wall('w_up_w', [[-3.5, 3.1], [-3.5, -3.1]], 1.25, 'room_wall', [
        {'id': 'bed_window', 'type': 'window', 'at': 1.95, 'w': 0.85, 'h': 0.62, 'sill': 0.52, 'style': 'grid', 'panes': [2, 2], 'outside': 'trees'}], level='up')
    B.wall('w_up_e', [[3.5, -3.1], [3.5, 3.1]], 1.25, 'room_wall', [
        {'id': 'tv_window', 'type': 'window', 'at': 4.5, 'w': 0.8, 'h': 0.6, 'sill': 0.55, 'style': 'grid', 'panes': [2, 2], 'outside': 'trees'}], level='up')
    # the stairs: walked on as the blueprint's flight (drawn by the staircase prop)
    B.d['stairs'] = [{'id': 'stairs_up', 'from': 'ground', 'to': 'up', 'a': [-2.6, -2.525], 'b': [0.9, -2.525], 'w': 0.95, 'steps': 16, 'style': 'hidden', 'rails': 'none'}]
    B.d['rails'] = [{'id': 'well_rail', 'level': 'up', 'path': [[-2.6, -3.0], [-2.6, -2.0], [0.9, -2.0]], 'h': 0.9, 'style': 'bars', 'mat': 'rafter'}]
    P = B.prop
    # --- the kitchen, along the back wall (the stairs climb over its west end) ---
    P('fridge', 3.04, -2.6, 270, params={'color': '#f7f3e6'})
    P('stove', 1.35, -2.66, 0, params={'color': '#f4ead0'}, use={'label': 'Look', 'lines': ['A big pot of MOM\'s stew bubbles on the stove.', 'It smells like home.']})
    P('range_hood', 1.35, -2.85, 0, y=1.85)
    P('kitchen_counter', 2.22, -2.67, 0, params={'size3': [0.85, 0.62, 0.9], 'sink': 0.05, 'clutter': 'cook', 'body': '#f2e6c8', 'top': '#e8b8a0'})
    P('wall_cabinets', 2.22, -2.9, 0, y=1.95, params={'size3': [0.85, 0.34, 0.7], 'glass': 0})
    P('apron_hook', 3.35, -1.65, 270, y=1.45, params={'color': '#f08aa6'})
    P('wall_clock', 3.4, 0.4, 270, y=2.15)
    # --- the dining table (Mom serves it) ---
    T, seats = B.table('chairs', 1.75, -0.15, 'home', ['n', 's', 'w', 'e'], size3=[1.1, 0.85, 0.74],
                       params={'wood': '#b5784a', 'cloth': '#e8706a', 'clothKind': 'gingham'},
                       seat_params={'wood': '#a8693e', 'cushion': '#e8a33a'}, lines=['Your place at the table.', 'MOM always says: no POKéMON cards at dinner!'])
    P('flower_vase', 1.6, -0.25, 0, y=0.745, params={'vase': '#7ab0d8', 'n': 8, 'seed': 2}, use=False)
    P('hanging_lamp', 1.75, -0.15, 0, y=CH, params={'style': 'pendant', 'drop': 0.85, 'color': '#f4c890'})
    # --- the entrance ---
    P('door_mat', 1.75, 2.6, 0, params={'size3': [1.1, 0.7, 0.02], 'color': '#c85a3a'})
    P('broom', 0.85, 2.85, 180)
    P('entry_bench', 3.2, 2.2, 270, params={'size3': [0.9, 0.36, 0.46]})
    P('umbrella_stand', 3.2, 2.85, 0)
    P('framed_picture', 3.4, 2.15, 270, y=1.55, params={'art': 'trainer', 'frame': '#c99a62', 'scale': 0.75}, use={'label': 'Look', 'lines': ['A photo of you in front of PROF. OAK\'s windmill.', 'MOM took it the day you said you\'d be a POKéMON MASTER.']})
    P('potted_plant', 0.55, 2.7, 0, params={'seed': 5, 'size': 0.5, 'pot': '#d8704a'})
    # --- the living room ---
    P('rug', -2.0, 0.55, 90, params={'size3': [2.6, 1.9, 0.02], 'color': '#c86a5a'})
    P('tv_set', -3.15, 0.55, 90, params={'wood': '#8a5a36'})
    P('home_sofa', -0.75, 0.55, 270, params={'color': '#e9a35a', 'pillows': ['#f4e3b8', '#7aa6d8']})
    P('coffee_table', -2.0, 0.55, 90, params={'size3': [0.95, 0.55, 0.42]})
    P('armchair', -2.3, 2.2, 145, params={'color': '#d86a5a'}, use={'label': 'Look', 'lines': ['MOM\'s armchair by the window.', 'Her knitting basket is tucked beside it.']})
    P('side_table', -3.15, 2.65, 0)
    P('flower_vase', -3.15, 2.65, 0, y=0.62, params={'vase': '#f2ead6', 'kind': 'rose', 'flowers': ['#f08aa6', '#e8473a', '#fbd0dc'], 'n': 7, 'seed': 4})
    P('curtains', -1.7, 2.95, 180, y=1.75, params={'size3': [2.6, 0.16, 1.85], 'color': '#f2b8c6', 'kind': 'gingham'})
    for z in (1.4, -1.4):
        P('curtains', -3.35, z, 90, y=1.85, params={'size3': [1.2, 0.16, 1.4], 'color': '#f2b8c6', 'kind': 'gingham', 'valance': True})
        P('curtains', 3.35, z, 270, y=1.85, params={'size3': [1.2, 0.16, 1.4], 'color': '#bfe0d8' if z < 0 else '#f2b8c6', 'kind': 'gingham'})
    P('wall_shelf', -3.4, 0.55, 90, y=1.75, params={'size3': [1.1, 0.25, 0.4], 'items': 'books', 'seed': 7})
    P('photo_frame', -3.35, 0.2, 90, y=1.565, params={'art': 'baby'})
    P('photo_frame', -3.35, 0.95, 90, y=1.565, params={'art': 'garden'})
    P('framed_picture', -2.6, 3.0, 180, y=1.95, params={'art': 'family', 'frame': '#b8864e', 'scale': 0.7}, use={'label': 'Look', 'lines': ['A photo of you and MOM at the beach.', 'You were so little! You\'re holding up a shell like a prize.']})
    P('framed_picture', -0.8, 3.0, 180, y=2.0, params={'art': 'house', 'frame': '#b8864e', 'scale': 0.55})
    P('potted_plant', -3.05, -1.65, 0, params={'seed': 9, 'size': 0.6, 'pot': '#c86a3e'})
    P('hanging_lamp', -2.0, 0.6, 0, y=CH, params={'style': 'dome'})
    # the stairs up to the bedrooms (set dressing), the phone on a table by them
    P('staircase', -0.85, -2.525, 0, walk='free', params={'size3': [3.5, 0.95, UP], 'steps': 16, 'wood': '#a8693e', 'carpet': '#c8463c'}, use=False)
    P('side_table', 0.0, -1.65, 0, params={'size3': [0.42, 0.42, 0.7]})
    P('telephone', 0.0, -1.65, 0, y=0.7)
    P('framed_picture', -0.45, -3.0, 0, y=0.85, params={'art': 'landscape', 'seed': 4, 'scale': 0.5}, use=False) if False else None
    # --- upstairs: Ash's room (EP001): the bed under the window, the alarm clock
    # he slept through, the TV and the game console, posters, toys, the desk,
    # a rug, a shelf, his backpack, clothes on the floor ---
    U = lambda *a, **k: P(*a, level='up', **k)
    U('bed', -2.85, 1.15, 0, params={'blanket': '#3f7ad0'},
      use={'label': 'Rest', 'rest': 'ash_bed', 'lines': ['Your bed. The blanket is still in a heap from this morning.', 'A quick nap...? No! There\'s a whole world out there!']})
    U('plush', -2.6, 0.45, 160, y=0.5, params={'kind': 'mouse', 'size3': [0.26, 0.26, 0.4]}, use={'label': 'Look', 'lines': ['A plush of a little yellow electric mouse.', 'You\'ve had it since you were five.']})
    U('side_table', -2.95, -0.25, 0, params={'size3': [0.42, 0.42, 0.52], 'wood': '#b5784a'})
    U('alarm_clock', -2.95, -0.25, 200, y=0.52)
    U('rug', 0.1, 0.6, 0, params={'size3': [2.4, 1.7, 0.02], 'color': '#4f7ad0'})
    U('tv_set', 3.0, 0.5, 270, params={'wood': '#a8693e', 'color': '#d8d4cc', 'console': True},
      use={'label': 'Look', 'lines': ['Your TV and your game console.', 'Last night\'s POKéMON LEAGUE replay is still paused on the screen.']})
    U('desk', 0.0, 2.56, 180, params={'wood': '#c9874f', 'drawers': 'left'}, use={'label': 'Look', 'lines': ['Your desk. Homework at the bottom, POKéMON cards on top.']})
    U('desk_lamp', 0.5, 2.7, 160, y=0.78, params={'color': '#e0473e'})
    U('dining_chair', 0.05, 1.85, 0, walk='free', params={'wood': '#c9874f', 'cushion': '#e0473e', 'style': 'cafe'})
    U('backpack', 1.05, 2.45, 200, use={'label': 'Look', 'lines': ['Your backpack, all packed for the journey.', 'Well... half packed.']})
    U('bookshelf', 2.2, -2.78, 0, params={'size3': [1.3, 0.4, 1.15], 'shelves': 2, 'wood': '#c9874f', 'seed': 9},
      use={'label': 'Read', 'lines': ['Comics, a POKéMON handbook, and a book called HOW TO BE A MASTER. Its spine has never been cracked.']})
    U('plush', 1.8, -2.78, 20, y=1.15, params={'kind': 'lizard', 'size3': [0.26, 0.26, 0.4]})
    U('plush', 2.25, -2.75, 0, y=1.15, params={'kind': 'ball', 'size3': [0.26, 0.26, 0.26]})
    U('plush', 2.65, -2.78, -20, y=1.15, params={'kind': 'blob', 'size3': [0.24, 0.24, 0.36]})
    U('plush', -0.6, 0.95, 0, y=0, params={'kind': 'ball', 'size3': [0.3, 0.3, 0.3]}, use={'label': 'Look', 'lines': ['A toy POKé BALL.', 'You\'ve thrown it at the wall about a thousand times, practising.']})
    U('clothes_pile', -0.8, 0.0, 30)
    U('clothes_pile', -1.85, 2.45, 200, params={'colors': ['#e0473e', '#f4f2ea']})
    U('poster', -1.75, 3.1, 180, y=1.45, params={'art': 'mouse', 'tilt': 0.04}, use={'label': 'Look', 'lines': ['A poster of a little yellow electric mouse. ZAP!']})
    U('poster', 1.75, 3.1, 180, y=1.45, params={'art': 'lizard', 'tilt': -0.03})
    U('poster', 2.2, -3.1, 0, y=1.85, params={'art': 'league', 'size3': [0.66, 0.02, 0.9]}, use={'label': 'Look', 'lines': ['POKéMON LEAGUE - INDIGO PLATEAU.', 'One day, you\'ll be there. One day soon.']})
    U('poster', -1.0, -3.1, 0, y=1.7, params={'art': 'ball', 'tilt': 0.05})
    U('hanging_lamp', 0.0, 0.4, 0, y=UP + 2.7, params={'style': 'dome'})
    U('crate', 3.0, -1.45, 10, params={'seed': 17, 'scale': 0.75}, use={'label': 'Look', 'lines': ['Your toy box. It doesn\'t close any more.']})
    U('plush', 2.95, -1.45, -30, y=0.6, params={'kind': 'mouse', 'size3': [0.22, 0.22, 0.34]})
    U('plush', 2.2, 1.35, 120, y=0, params={'kind': 'blob', 'size3': [0.26, 0.26, 0.4]})
    U('photo_frame', -0.45, 2.75, 200, y=0.78, params={'art': 'family'})
    U('tablet', 0.2, 2.45, 170, y=0.78)
    U('clothes_pile', 2.3, -0.45, 80, params={'colors': ['#3a6ad0', '#3a3d46']})
    B.d['actors'] = []
    B.d['residents'] = {'house': 'red', 'people': {
        'delia': {'breakfast': [1.45, -1.95, 180], 'supper': [1.45, -1.95, 180], 'home': [-0.2, 2.0, 225], '_': [1.0, 1.2, 200]}},
        'default': [0.8, 1.6, 180], 'hide': ['sleep']}
    B.d['dialogue'] = {}
    B.d['spawns'] = [{'id': 'from_town', 'pos': [1.75, 1.55], 'level': 'ground', 'rot': 180}]
    B.d['portals'] = [{'id': 'to_town', 'level': 'ground', 'rect': [1.25, 2.8, 2.25, 3.1], 'trigger': 'walk', 'spawn': 'from_town',
                       'to': {'map': 'pallet_town', 'spawn': 'red_door'}, 'label': 'Outside'}]
    B.d['lights'] = {
        'key': {'dir': [-0.35, 0.9, 0.45], 'shadow': True, 'dist': 14}, 'upperShadows': False,
        'palette': {'bands': [0.02, 0.14, 0.58], 'deep': [0.8, 0.7, 0.74], 'shade': [0.9, 0.82, 0.82], 'lit': [1.07, 1.03, 0.95], 'litAdd': [0.05, 0.035, 0.01]},
        'bg': '#2c2228',
        'lamps': [
            {'id': 'table_lamp', 'pos': [1.75, 2.0, -0.15], 'r': 2.0, 'color': '#ffdca0', 'kind': 'pendant'},
            {'id': 'living_lamp', 'pos': [-2.0, 2.7, 0.6], 'r': 2.4, 'color': '#fff0c8', 'kind': 'panel'},
            {'id': 'tv', 'pos': [-2.85, 0.95, 0.55], 'r': 1.1, 'color': '#a8d8ff', 'kind': 'screen'},
            {'id': 'hood', 'pos': [1.35, 1.6, -2.6], 'r': 0.9, 'color': '#fff2c8', 'kind': 'desk'},
            {'id': 'room_lamp', 'pos': [0.0, UP + 2.45, 0.4], 'r': 2.6, 'color': '#fff0c8', 'kind': 'panel'},
            {'id': 'room_tv', 'pos': [2.75, UP + 0.95, 0.5], 'r': 1.1, 'color': '#a8d8ff', 'kind': 'screen'},
            {'id': 'desk_lamp', 'pos': [0.45, UP + 1.25, 2.65], 'r': 0.9, 'color': '#ffe8a8', 'kind': 'desk'},
        ]}
    B.d['camera'] = {'default': {'dist': 3.3, 'pitch': 0.42, 'fov': 60, 'height': 1.35}, 'margin': 0.22, 'volumes': [
        {'id': 'door', 'box': [1.15, 0, 2.85, 2.35, 2.2, 3.15], 'dist': 2.8, 'pitch': 0.38},
        {'id': 'stairs', 'box': [-3.4, 0, -3.0, 0.9, UP + 1.9, -1.95], 'dist': 2.6, 'pitch': 0.35},
        {'id': 'room', 'box': [-3.4, UP, -3.0, 3.4, UP + 2.7, 3.0], 'vault': {'axis': 'z', 'spring': UP + 1.25, 'rise': 1.45}, 'dist': 3.0, 'pitch': 0.48},
        {'id': 'house', 'box': [-3.4, 0, -3.0, 3.4, CH, 3.0], 'dist': 3.3, 'pitch': 0.42}]}
    B.d['props'] = [p for p in B.d['props'] if p]
    B.save()

# =====================================================================
# PALLET HOUSE (Delia's restaurant, rooms upstairs: the inn): terrain.js
# PALLET_HOUSE, town.js palletHouse(): 13 x 9 (local x -6.5..6.5, z -6.5..2.5),
# the double door at x 0 on the front (+z, toward the bay), front windows at
# x +-4.4, side windows, the kitchen door and window on the back, the chimney
# at x -3.6. Local frame = the house's placer frame; the floor 0.3 over hs.y.
# =====================================================================
def pallet():
    B = BP(id='pallet_house', name='PALLET HOUSE', kind='interior', bounds=[-6.6, -6.6, 6.6, 2.6])
    B.d['place'] = {'map': 'pallet_town', 'house': 'pallet_house', 'at': [144, 98], 'rot': -34.38,
                    'door': {'use': [0, 3.4], 'exit': [0, 3.6], 'r': 1.3},
                    'note': 'PALLET HOUSE (terrain.js PALLET_HOUSE): local = the house frame; its front door at (0, 2.5)'}
    B.d['palette'] = {
        'boards': {'color': '#b07848', 'label': 'oak floorboards', 'pattern': 'boards', 'gloss': 0.08},
        'kboards': {'color': '#c8a070', 'label': 'kitchen tiles', 'pattern': 'checker', 'color2': '#efe4cc', 'gloss': 0.08},
        'plaster': {'color': '#f2e2b8', 'label': 'cream plaster'},
        'kplaster': {'color': '#f6ecd4', 'label': 'kitchen plaster'},
        'panel': {'color': '#8a5634', 'label': 'dark wainscot'},
        'ktile': {'color': '#f2f0e6', 'label': 'white tiles'},
        'ceiling': {'color': '#d8b888', 'label': 'board ceiling', 'pattern': 'boards'},
        'beam': {'color': '#6b4a33', 'label': 'beams'},
    }
    B.d['levels'] = [{'id': 'ground', 'name': 'Ground floor', 'y': 0}]
    CH = 3.0
    B.d['zones'] = [
        {'id': 'dining', 'name': 'Dining room', 'level': 'ground', 'poly': [[-6.4, -4.2], [6.4, -4.2], [6.4, 2.4], [-6.4, 2.4]], 'floor': 'boards',
         'ceiling': {'type': 'flat', 'h': CH, 'mat': 'ceiling', 'beams': {'axis': 'z', 'step': 1.6}, 'beamCol': '#6b4a33', 'holes': [[5.35, -1.95, 6.3, -0.55]]}},
        {'id': 'kitchen', 'name': 'Kitchen', 'level': 'ground', 'poly': [[-6.4, -6.4], [6.4, -6.4], [6.4, -4.2], [-6.4, -4.2]], 'floor': 'kboards',
         'ceiling': {'type': 'flat', 'h': CH, 'mat': 'ceiling'}},
    ]
    wain = {'h': 1.0, 'mat': 'panel'}
    rail = {'y': 2.1, 'col': '#6b4a33'}
    B.wall('w_front', [[-6.4, 2.4], [6.4, 2.4]], CH, 'plaster', [
        {'id': 'win_fl', 'type': 'window', 'at': 2.0, 'w': 1.6, 'h': 1.3, 'sill': 0.95, 'style': 'grid', 'panes': [2, 2], 'outside': 'sea', 'frame': '#fbf3e0'},
        {'id': 'front_door', 'type': 'door', 'at': 6.4, 'w': 1.7, 'h': 2.3, 'style': 'double', 'portal': 'to_town', 'wood': '#7a4a2e', 'frame': '#6b4a33'},
        {'id': 'win_fr', 'type': 'window', 'at': 10.8, 'w': 1.6, 'h': 1.3, 'sill': 0.95, 'style': 'grid', 'panes': [2, 2], 'outside': 'sea', 'frame': '#fbf3e0'},
    ], wainscot=wain, cornice='#6b4a33', rail=rail)
    B.wall('w_west', [[-6.4, 2.4], [-6.4, -6.4]], CH, 'plaster', [
        {'id': 'win_w1', 'type': 'window', 'at': 2.4, 'w': 1.3, 'h': 1.2, 'sill': 1.0, 'style': 'grid', 'panes': [2, 2], 'outside': 'sea', 'frame': '#fbf3e0'},
    ], wainscot=wain, cornice='#6b4a33', rail=rail)
    B.wall('w_east', [[6.4, -6.4], [6.4, 2.4]], CH, 'plaster', [
        {'id': 'win_e1', 'type': 'window', 'at': 6.4, 'w': 1.3, 'h': 1.2, 'sill': 1.0, 'style': 'grid', 'panes': [2, 2], 'outside': 'trees', 'frame': '#fbf3e0'},
        {'id': 'win_e2', 'type': 'window', 'at': 1.0, 'w': 0.9, 'h': 1.0, 'sill': 1.2, 'style': 'grid', 'panes': [2, 2], 'outside': 'trees', 'frame': '#fbf3e0'},
    ], wainscot=wain, cornice='#6b4a33', rail=rail)
    B.wall('w_back', [[6.4, -6.4], [-6.4, -6.4]], CH, 'kplaster', [
        {'id': 'win_k', 'type': 'window', 'at': 3.8, 'w': 1.4, 'h': 1.0, 'sill': 1.2, 'style': 'grid', 'panes': [2, 2], 'outside': 'garden', 'frame': '#fbf3e0'},
        {'id': 'back_door', 'type': 'door', 'at': 10.0, 'w': 1.0, 'h': 2.15, 'style': 'panel', 'locked': True, 'wood': '#7a4a2e',
         'use': {'label': 'Door', 'lines': ['The kitchen door out to the herb garden.', 'Better use the front door.'], 'side': -1}},
    ], wainscot={'h': 1.4, 'mat': 'ktile'}, cornice=True)
    # the kitchen partition: the fireplace in front of it (the chimney at x -3.6), the arch to the kitchen behind the counter
    B.wall('w_part', [[-6.4, -4.2], [6.4, -4.2]], CH, 'plaster', [
        {'id': 'kitchen_arch', 'type': 'arch', 'at': 8.6, 'w': 1.2, 'h': 2.3},
    ], wainscot=wain, cornice='#6b4a33', rail=rail, t=0.2)
    P = B.prop
    # --- the counter, the innkeeper's spot behind it, the menu and the shelves ---
    P('inn_counter', 1.9, -2.95, 0, params={'size3': [3.0, 0.7, 1.05], 'wood': '#8a5634'},
      use={'label': 'Order', 'food_place': 'inn', 'at': [1.9, -2.15], 'r': 1.4, 'lines': ['The counter of PALLET HOUSE.', '"Home cooking since Grandma\'s day."']})
    P('menu_board', 1.0, -4.1, 0, y=2.05, params={'size3': [1.4, 0.08, 1.0], 'title': 'PALLET HOUSE', 'special': 'TODAY: GRANDMA\'S STEW',
      'items': [['Cream stew', '450'], ['Omelette rice', '400'], ['Curry & rice', '420'], ['Berry tart', '250'], ['Tea / Cocoa', '120']]},
      use={'label': 'Read', 'lines': ['PALLET HOUSE  -  MENU', 'Cream stew 450 · Omelette rice 400 · Curry & rice 420', 'Berry tart 250 · Tea or cocoa 120', 'TODAY: GRANDMA\'S STEW']})
    P('wall_shelf', 3.6, -4.1, 0, y=1.75, params={'size3': [1.2, 0.25, 0.4], 'items': 'jars', 'seed': 11, 'wood': '#7a4a2e'})
    P('wall_shelf', 3.6, -4.1, 0, y=2.35, params={'size3': [1.2, 0.25, 0.4], 'items': 'bottles', 'seed': 12, 'wood': '#7a4a2e'})
    P('barrel', 3.85, -2.75, 0)
    P('barrel', 4.0, -3.55, 25, params={'scale': 0.85})
    P('flower_vase', 0.75, -2.9, 0, y=1.05, params={'vase': '#f2ead6', 'n': 7, 'seed': 6}, use=False)
    P('hanging_lamp', 1.2, -2.95, 0, y=CH, params={'style': 'tiffany', 'drop': 0.85})
    P('hanging_lamp', 2.6, -2.95, 0, y=CH, params={'style': 'tiffany', 'drop': 0.85})
    # --- the fireplace and two armchairs by it ---
    P('fireplace', -3.6, -3.8, 0, params={'size3': [1.9, 0.6, 1.45], 'stone': '#c9b89a'})
    P('framed_picture', -3.6, -4.1, 0, y=2.2, params={'art': 'landscape', 'seed': 12, 'frame': '#7a4a2e', 'size3': [0.9, 0.05, 0.62]},
      use={'label': 'Look', 'lines': ['A painting of PALLET TOWN from the sea.', 'Grandma painted it the summer she opened the restaurant.']})
    P('armchair', -4.9, -2.2, 150, params={'color': '#a8463c'})
    P('armchair', -2.3, -2.2, 210, params={'color': '#a8463c'})
    P('side_table', -3.6, -2.0, 0, params={'size3': [0.45, 0.45, 0.55]})
    P('rug', -3.6, -2.55, 0, params={'size3': [3.0, 1.7, 0.02], 'color': '#8a3a3a'})
    P('plate_dresser', -1.2, -3.83, 0, params={'size3': [1.5, 0.5, 2.1]}, use={'label': 'Look', 'lines': ['The dresser is full of Grandma\'s blue and white plates.', 'Not one of them is chipped.']})
    # --- the tables ---
    lines = ['A table by the window.', 'The tablecloth smells of sunshine.']
    B.table('chairs', -4.4, 0.5, 'inn', ['n', 's', 'w', 'e'], size3=[0.9, 0.9, 0.74], params={'wood': '#8a5634', 'cloth': '#c8463c', 'clothKind': 'gingham'},
            seat_params={'wood': '#7a4a2e', 'style': 'ladder'}, lines=lines)
    B.table('chairs', -1.9, 0.9, 'inn', ['n', 's', 'w', 'e'], size3=[0.95, 0.95, 0.74], params={'wood': '#8a5634', 'cloth': '#f4efe2', 'clothKind': 'lace', 'round': True},
            seat_params={'wood': '#7a4a2e', 'style': 'ladder'}, lines=lines)
    B.table('chairs', 2.4, 0.7, 'inn', ['n', 's', 'w', 'e'], size3=[0.9, 0.9, 0.74], params={'wood': '#8a5634', 'cloth': '#3f7a52', 'clothKind': 'gingham'},
            seat_params={'wood': '#7a4a2e', 'style': 'ladder'}, lines=lines)
    B.table('chairs', 4.75, 1.3, 'inn', ['w', 'e'], size3=[0.8, 0.75, 0.74], params={'wood': '#8a5634', 'cloth': '#c8463c', 'clothKind': 'gingham'},
            seat_params={'wood': '#7a4a2e', 'style': 'ladder'}, lines=lines)
    for x, z, s in ((-4.4, 0.5, 1), (-1.9, 0.9, 2), (2.4, 0.7, 3), (4.75, 1.3, 4)):
        P('flower_vase', x + 0.05, z - 0.05, 0, y=0.745, params={'vase': ['#f2ead6', '#7ab0d8', '#e8c46a', '#f2ead6'][s - 1], 'n': 5, 'seed': 20 + s,
          'size3': [0.22, 0.22, 0.38], 'kind': ['daisy', 'rose', 'tulip', 'daisy'][s - 1]}, use=False)
        P('hanging_lamp', x, z, 0, y=CH, params={'style': 'cone', 'drop': 0.7, 'color': '#3f7a52' if s % 2 else '#c8463c'})
    # --- the door, the coat stand, plants, pictures ---
    P('door_mat', 0.0, 1.9, 0, params={'size3': [1.6, 0.8, 0.02], 'color': '#7a3a2a'})
    P('coat_stand', -1.1, 2.0, 0)
    P('potted_plant', 1.15, 1.95, 0, params={'seed': 31, 'size': 0.62, 'pot': '#c86a3e'})
    P('potted_plant', -6.0, 2.0, 0, params={'seed': 32, 'size': 0.55, 'pot': '#b05a3a'})
    P('potted_plant', -6.0, -3.75, 0, params={'seed': 33, 'size': 0.5, 'pot': '#c86a3e'})
    P('curtains', -4.4, 2.25, 180, y=1.65, params={'size3': [2.0, 0.16, 1.55], 'color': '#c8463c', 'kind': 'gingham'})
    P('curtains', 4.4, 2.25, 180, y=1.65, params={'size3': [2.0, 0.16, 1.55], 'color': '#c8463c', 'kind': 'gingham'})
    P('curtains', -6.25, 0.0, 90, y=1.65, params={'size3': [1.7, 0.16, 1.45], 'color': '#c8463c', 'kind': 'gingham'})
    P('curtains', 6.25, 0.0, 270, y=1.65, params={'size3': [1.7, 0.16, 1.45], 'color': '#c8463c', 'kind': 'gingham'})
    P('framed_picture', -6.3, -2.0, 90, y=1.65, params={'art': 'garden', 'frame': '#7a4a2e', 'scale': 0.8})
    P('framed_picture', 6.3, 1.7, 270, y=1.6, params={'art': 'house', 'frame': '#7a4a2e', 'scale': 0.7})
    P('notice_board', 3.0, 2.3, 180, y=1.65, params={'title': 'ROOMS UPSTAIRS', 'lines': ['Two rooms, sea view', 'Breakfast included', 'Ask DELIA at the counter'], 'style': 'pinned', 'size3': [1.1, 0.06, 0.8]},
      use={'label': 'Read', 'lines': ['ROOMS UPSTAIRS: two rooms with a sea view.', 'Breakfast included. Ask DELIA at the counter!']})
    P('wall_clock', -2.5, 2.3, 180, y=2.35)
    for x in (-5.6, -0.6):
        P('wall_lamp', x, 2.3, 180, y=1.85)
    for z in (-1.0,):
        P('wall_lamp', -6.3, z, 90, y=1.85)
    # the stairs up to the rooms (along the east wall, climbing toward the front)
    P('staircase', 5.8, -2.2, 270, params={'size3': [3.4, 0.95, CH], 'wood': '#8a5634', 'carpet': '#3f7a52'},
      use={'label': 'Look', 'lines': ['The stairs up to the guest rooms.', 'A little sign says: GUESTS ONLY, PLEASE.']})
    # --- the kitchen behind ---
    P('stove', -1.9, -5.96, 0, params={'color': '#efe4c8', 'kettle': '#3f7a52'})
    P('range_hood', -1.9, -6.2, 0, y=1.9)
    P('kitchen_counter', -0.15, -5.97, 0, params={'size3': [2.6, 0.62, 0.9], 'clutter': 'cook', 'body': '#efe4c8', 'top': '#d8c8a8', 'seed': 4})
    P('kitchen_counter', 3.6, -5.97, 0, params={'size3': [2.2, 0.62, 0.9], 'sink': 0.2, 'clutter': 'cook', 'body': '#efe4c8', 'top': '#d8c8a8', 'seed': 5})
    P('wall_cabinets', -0.15, -6.2, 0, y=2.05, params={'size3': [2.4, 0.34, 0.65], 'body': '#efe4c8', 'glass': 2})
    P('fridge', 5.6, -5.93, 0, params={'color': '#f2eee2'})
    P('wall_shelf', -4.6, -6.3, 0, y=1.7, params={'size3': [1.6, 0.25, 0.4], 'items': 'plates', 'seed': 13})
    P('wall_shelf', -4.6, -6.3, 0, y=2.3, params={'size3': [1.6, 0.25, 0.4], 'items': 'jars', 'seed': 14})
    P('kitchen_counter', -4.6, -5.97, 0, params={'size3': [1.6, 0.62, 0.9], 'clutter': 'tea', 'body': '#efe4c8', 'top': '#d8c8a8', 'seed': 6})
    P('barrel', -6.0, -4.65, 0, params={'scale': 0.8})
    P('hanging_lamp', -0.5, -5.3, 0, y=CH, params={'style': 'cone', 'drop': 0.8, 'color': '#efe4c8'})
    P('hanging_lamp', 3.4, -5.3, 0, y=CH, params={'style': 'cone', 'drop': 0.8, 'color': '#efe4c8'})
    B.d['actors'] = []
    # Delia cooks in her restaurant (life.gd: 'cook' at pallet_house): behind the counter
    B.d['residents'] = {'house': 'pallet_house', 'people': {'delia': {'cook': [1.9, -3.75, 0], '_': [1.9, -3.75, 0]}}, 'default': [-0.4, -2.6, 180], 'hide': ['sleep']}
    B.d['dialogue'] = {}
    B.d['spawns'] = [{'id': 'from_town', 'pos': [0.0, 1.35], 'level': 'ground', 'rot': 180}]
    B.d['portals'] = [{'id': 'to_town', 'level': 'ground', 'rect': [-0.8, 2.05, 0.8, 2.4], 'trigger': 'walk', 'spawn': 'from_town',
                       'to': {'map': 'pallet_town', 'spawn': 'pallet_house_door'}, 'label': 'Outside'}]
    B.d['lights'] = {
        'key': {'dir': [0.25, 0.9, 0.5], 'shadow': True, 'dist': 18},
        'palette': {'bands': [0.02, 0.14, 0.58], 'deep': [0.76, 0.64, 0.66], 'shade': [0.88, 0.78, 0.76], 'lit': [1.08, 1.02, 0.92], 'litAdd': [0.06, 0.04, 0.01]},
        'bg': '#2a1e1c',
        'lamps': [{'id': 'fire', 'pos': [-3.6, 0.45, -3.55], 'r': 2.2, 'color': '#ffa860', 'kind': 'fire'},
                  {'id': 'counter_1', 'pos': [1.2, 2.0, -2.95], 'r': 1.4, 'color': '#ffd890', 'kind': 'pendant'},
                  {'id': 'counter_2', 'pos': [2.6, 2.0, -2.95], 'r': 1.4, 'color': '#ffd890', 'kind': 'pendant'},
                  {'id': 't1', 'pos': [-4.4, 2.2, 0.5], 'r': 1.6, 'color': '#ffe2a8', 'kind': 'pendant'},
                  {'id': 't2', 'pos': [-1.9, 2.2, 0.9], 'r': 1.6, 'color': '#ffe2a8', 'kind': 'pendant'},
                  {'id': 't3', 'pos': [2.4, 2.2, 0.7], 'r': 1.6, 'color': '#ffe2a8', 'kind': 'pendant'},
                  {'id': 't4', 'pos': [4.75, 2.2, 1.3], 'r': 1.3, 'color': '#ffe2a8', 'kind': 'pendant'},
                  {'id': 'sconce_1', 'pos': [-5.6, 1.9, 2.15], 'r': 0.9, 'color': '#fff0c0', 'kind': 'desk'},
                  {'id': 'sconce_2', 'pos': [-0.6, 1.9, 2.15], 'r': 0.9, 'color': '#fff0c0', 'kind': 'desk'},
                  {'id': 'sconce_3', 'pos': [-6.15, 1.9, -1.0], 'r': 0.9, 'color': '#fff0c0', 'kind': 'desk'},
                  {'id': 'k1', 'pos': [-0.5, 2.0, -5.3], 'r': 1.6, 'color': '#fff4d8', 'kind': 'pendant'},
                  {'id': 'k2', 'pos': [3.4, 2.0, -5.3], 'r': 1.6, 'color': '#fff4d8', 'kind': 'pendant'}]}
    B.d['camera'] = {'default': {'dist': 4.2, 'pitch': 0.4, 'fov': 58, 'height': 1.35}, 'margin': 0.22, 'volumes': [
        {'id': 'door', 'box': [-0.85, 0, 2.2, 0.85, 2.3, 2.5], 'dist': 3.0, 'pitch': 0.38},
        {'id': 'arch', 'box': [1.4, 0, -4.45, 2.6, 2.3, -3.95], 'dist': 3.0, 'pitch': 0.4},
        {'id': 'kitchen', 'box': [-6.3, 0, -6.3, 6.3, CH, -4.3], 'dist': 3.0, 'pitch': 0.48},
        {'id': 'dining', 'box': [-6.3, 0, -4.1, 6.3, CH, 2.3], 'dist': 4.2, 'pitch': 0.4}]}
    B.save()

# =====================================================================
# The tea house on Route 1 (route1land.js TEA, props/outdoor.js teaHouse):
# W 8.4 x D 5.6, the front wall at z 1.5 (the veranda before it), the back
# at -2.8; the way in in the middle bay (x -1.4..1.4), shoji in the left bay,
# the serving counter in the right (the keeper behind it at 1.9, 0.75), the
# round window in the west wall; the floor 0.48 up. Local = the house frame.
# =====================================================================
def tea():
    B = BP(id='tea_house', name='Tea House', kind='interior', bounds=[-4.3, -2.9, 4.3, 1.7])
    B.d['place'] = {'map': 'pallet_town', 'house': '', 'at': [-76, -262], 'rot': 75.68,
                    'door': {'use': [0, 2.35], 'exit': [0, 2.3], 'r': 1.2},
                    'note': 'the Route 1 tea house (route1land.js TEA): local = its frame; the way in at (0, 1.5)'}
    B.d['palette'] = {
        'tatami': {'color': '#c8c68a', 'label': 'tatami', 'pattern': 'tatami'},
        'engawa': {'color': '#b08458', 'label': 'polished boards', 'pattern': 'boards', 'gloss': 0.1},
        'plaster': {'color': '#e6d6b8', 'label': 'clay plaster'},
        'dado': {'color': '#8a5b38', 'label': 'wood dado'},
        'ceiling': {'color': '#c8a272', 'label': 'cedar boards', 'pattern': 'boards'},
    }
    B.d['levels'] = [{'id': 'ground', 'name': 'Tea room', 'y': 0}]
    CH = 2.5
    B.d['zones'] = [
        {'id': 'room', 'name': 'Tea room', 'level': 'ground', 'poly': [[-4.1, -2.7], [4.1, -2.7], [4.1, 0.9], [-4.1, 0.9]], 'floor': 'tatami',
         'ceiling': {'type': 'flat', 'h': CH, 'mat': 'ceiling', 'beams': {'axis': 'x', 'step': 1.2}, 'beamCol': '#5a3a22'}},
        {'id': 'genkan', 'name': 'Entrance and counter', 'level': 'ground', 'poly': [[-4.1, 0.9], [4.1, 0.9], [4.1, 1.5], [-4.1, 1.5]], 'floor': 'engawa', 'boards': 'x',
         'ceiling': {'type': 'flat', 'h': CH, 'mat': 'ceiling'}},
    ]
    dado = {'h': 0.75, 'mat': 'dado'}
    rail = {'y': 2.0, 'col': '#5a3a22'}
    B.wall('w_front', [[-4.1, 1.5], [4.1, 1.5]], CH, 'plaster', [
        {'id': 'shoji_l', 'type': 'window', 'at': 1.4, 'w': 2.3, 'h': 1.25, 'sill': 0.8, 'style': 'shoji', 'frame': '#5a3a22'},
        {'id': 'way_in', 'type': 'door', 'at': 4.1, 'w': 1.6, 'h': 2.05, 'style': 'shoji', 'portal': 'to_road', 'wood': '#5a3a22', 'frame': '#5a3a22'},
        {'id': 'serving', 'type': 'window', 'at': 6.8, 'w': 2.3, 'h': 1.15, 'sill': 0.97, 'style': 'plain', 'outside': 'trees', 'frame': '#5a3a22'},
    ], wainscot=dado, t=0.14, rail=rail, cornice='#5a3a22')
    B.wall('w_back', [[4.1, -2.7], [-4.1, -2.7]], CH, 'plaster', [], wainscot=dado, t=0.14, rail=rail, cornice='#5a3a22')
    B.wall('w_west', [[-4.1, -2.7], [-4.1, 1.5]], CH, 'plaster', [
        {'id': 'round_win', 'type': 'window', 'at': 2.08, 'w': 0.86, 'h': 0.86, 'sill': 1.07, 'style': 'round', 'outside': 'trees', 'frame': '#5a3a22'},
    ], wainscot=dado, t=0.14, rail=rail, cornice='#5a3a22')
    B.wall('w_east', [[4.1, 1.5], [4.1, -2.7]], CH, 'plaster', [
        {'id': 'shoji_e', 'type': 'window', 'at': 2.6, 'w': 1.6, 'h': 1.1, 'sill': 0.85, 'style': 'shoji', 'frame': '#5a3a22'},
    ], wainscot=dado, t=0.14, rail=rail, cornice='#5a3a22')
    # the posts: dark timber at the corners and between the bays
    B.d['runs'] = [{'id': f'post_{i}', 'type': 'timber', 'pts': [[x, 0, z], [x, CH, z]], 'r': 0.08, 'mat': 'dado'} for i, (x, z) in enumerate(
        [(-3.95, 1.4), (-1.4, 1.4), (1.4, 1.4), (3.95, 1.4), (-3.95, -2.6), (3.95, -2.6), (-0.98, -2.6), (0.98, -2.6), (-3.95, -0.6), (3.95, -0.6)])]
    P = B.prop
    # --- the alcove: the scroll, the ikebana, the bonsai beside it ---
    P('tokonoma', 0.0, -2.25, 0, params={'size3': [1.8, 0.7, 0.15], 'post': CH})
    P('hanging_scroll', 0.0, -2.6, 0, y=1.45, params={'art': 'tea', 'size3': [0.62, 0.05, 1.45]},
      use={'label': 'Look', 'lines': ['A hanging scroll with one big brushed character: TEA.', 'The keeper says her grandfather painted it.']})
    P('ikebana', 0.45, -2.3, 0, y=0.15, params={'flower': '#d8303a'}, use={'label': 'Look', 'lines': ['A branch of pine and two red camellias in a shallow dish.']})
    P('bonsai', 1.45, -2.35, 0)
    # --- the tea counter and the keeper ---
    P('tea_counter', 2.75, 0.1, 180, params={'size3': [2.4, 0.6, 0.95], 'wood': '#8a5b38'},
      use={'label': 'Order', 'food_place': 'tea_house', 'at': [2.6, -0.6], 'r': 1.3, 'lines': ['The tea counter. The kettle hums on the coals.']})
    P('wall_shelf', 2.75, 1.42, 180, y=1.85, params={'size3': [2.0, 0.25, 0.35], 'items': 'tea', 'wood': '#5a3a22', 'seed': 21})
    P('menu_board', -2.6, -2.62, 0, y=1.55, params={'size3': [1.0, 0.08, 0.75], 'title': 'TODAY\'S TEA', 'frame': '#5a3a22',
      'items': [['Green tea', '50'], ['Barley tea', '40'], ['Sweet dumplings', '80'], ['Lemonade', '60']], 'special': '~ please rest a while ~'},
      use={'label': 'Read', 'lines': ['TODAY\'S TEA: green tea 50, barley tea 40, sweet dumplings 80, lemonade 60.', '~ please rest a while ~']})
    # --- the low tables and their cushions ---
    lines = ['A cushion by the low table.', 'The tatami smells of fresh grass.']
    B.table('cushions', -2.5, -0.95, 'tea_house', ['n', 's', 'w', 'e'], table_type='low_table', size3=[1.1, 0.75, 0.33], params={'color': '#4a2e22'},
            seat_type='zabuton', seat_params={'color': '#b8443a'}, lines=lines)
    B.table('cushions', 2.5, -1.65, 'tea_house', ['n', 'w', 'e'], table_type='low_table', size3=[1.0, 0.7, 0.33], params={'color': '#4a2e22'},
            seat_type='zabuton', seat_params={'color': '#3f5f7a'}, lines=lines)
    P('tea_set', -2.55, -0.95, 0, y=0.33, params={'color': '#5f7f6a'}, use=False)
    P('tea_set', 2.55, -1.65, 15, y=0.33, params={'color': '#8a5a3a', 'cups': 3}, use=False)
    # --- light and dressing ---
    P('andon', -3.7, -2.3, 0)
    P('andon', 3.7, -2.3, 0)
    P('andon', -0.9, 1.2, 0)
    P('paper_lantern', -2.5, -0.95, 0, y=CH, params={'color': '#e0402c', 'drop': 0.6, 'text': ''})
    P('paper_lantern', 2.5, -1.65, 0, y=CH, params={'color': '#f4ead0', 'drop': 0.6})
    P('folding_screen', -3.75, -1.05, 90, params={'size3': [1.8, 0.35, 1.3]})
    P('shoji_panel', -2.4, -2.62, 0, y=1.0, params={'size3': [1.6, 0.06, 2.0]}) if False else None
    P('shoji_panel', 4.02, -1.55, 270, y=1.0, params={'size3': [1.6, 0.06, 2.0], 'panels': 2})
    P('potted_plant', 1.15, 1.1, 0, params={'seed': 51, 'size': 0.5, 'pot': '#6a7a8a'})
    P('potted_plant', -3.7, 1.1, 0, params={'seed': 52, 'size': 0.55, 'pot': '#6a7a8a'})
    P('door_mat', 0.0, 1.15, 0, params={'size3': [1.4, 0.5, 0.02], 'color': '#6a7a5a'})
    B.d['props'] = [p for p in B.d['props'] if p]
    B.d['actors'] = [{'id': 'tea_keeper', 'look': 'rose', 'name': 'Tea keeper Hana', 'pos': [2.6, 0.8], 'rot': 180, 'level': 'ground', 'pose': 'stand', 'dialogue': 'keeper'}]
    B.d['dialogue'] = {'keeper': ['Welcome, welcome! Sit down and rest your legs.', 'Travellers from PALLET TOWN always stop here before VIRIDIAN CITY.',
                                  'The tea is green tea from my own bushes, and the water comes from the spring up the hill.']}
    B.d['spawns'] = [{'id': 'from_road', 'pos': [0.0, 0.55], 'level': 'ground', 'rot': 180}]
    B.d['portals'] = [{'id': 'to_road', 'level': 'ground', 'rect': [-0.75, 1.2, 0.75, 1.5], 'trigger': 'walk', 'spawn': 'from_road',
                       'to': {'map': 'pallet_town', 'spawn': 'tea_house_door'}, 'label': 'Outside'}]
    B.d['lights'] = {
        'key': {'dir': [0.2, 0.92, 0.35], 'shadow': True, 'dist': 14},
        'palette': {'bands': [0.02, 0.15, 0.58], 'deep': [0.74, 0.66, 0.62], 'shade': [0.88, 0.8, 0.74], 'lit': [1.06, 1.02, 0.9], 'litAdd': [0.06, 0.045, 0.01]},
        'bg': '#241c18',
        'lamps': [{'id': 'andon_1', 'pos': [-3.7, 0.55, -2.3], 'r': 1.3, 'color': '#ffd890', 'kind': 'desk'},
                  {'id': 'andon_2', 'pos': [3.7, 0.55, -2.3], 'r': 1.3, 'color': '#ffd890', 'kind': 'desk'},
                  {'id': 'andon_3', 'pos': [-0.9, 0.55, 1.2], 'r': 1.1, 'color': '#ffd890', 'kind': 'desk'},
                  {'id': 'lantern_1', 'pos': [-2.5, 1.65, -0.95], 'r': 1.7, 'color': '#ffb070', 'kind': 'pendant'},
                  {'id': 'lantern_2', 'pos': [2.5, 1.65, -1.65], 'r': 1.6, 'color': '#fff0c8', 'kind': 'pendant'},
                  {'id': 'brazier', 'pos': [1.95, 1.15, 0.1], 'r': 0.9, 'color': '#ff9a50', 'kind': 'fire'}]}
    B.d['camera'] = {'default': {'dist': 3.1, 'pitch': 0.44, 'fov': 60, 'height': 1.3}, 'margin': 0.2, 'volumes': [
        {'id': 'room', 'box': [-4.0, 0, -2.6, 4.0, CH, 1.43], 'dist': 3.1, 'pitch': 0.44},
        {'id': 'door', 'box': [-0.8, 0, 1.2, 0.8, 2.0, 1.56], 'dist': 2.6, 'pitch': 0.4}]}
    B.save()

which = sys.argv[1:] or ['ketchum', 'pallet', 'tea']
for w in which: globals()[w]()
