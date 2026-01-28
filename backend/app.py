import os
import logging
import json
from flask import Flask, request, jsonify, abort
from models import db, Round, Kill, RoundPlayer
from functools import wraps

app = Flask(__name__)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///stats.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
API_KEY = os.environ.get('API_KEY', 'changeme')

db.init_app(app)

logging.basicConfig(level=logging.INFO)

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Allow checking via query param or header for flexibility
        key = request.headers.get('X-Api-Key') or request.args.get('api_key')
        if key != API_KEY:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/api/collect', methods=['POST'])
@require_api_key
def collect_stats():
    try:
        data = json.loads(request.data)
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON'}), 400

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    logging.info(f"Received Round UUID: {data.get('round_id')}")

    try:
        new_round = Round(
            id=data.get('round_id'),
            map_name=data.get('map_name'),
            winner=data.get('winner'),
            duration=data.get('duration')
        )
        db.session.add(new_round)

        # Process Roles
        players_dict = {}

        # Start roles
        for p in data.get('start_roles', []):
            sid = p.get('player_steamid')
            if sid:
                players_dict[sid] = {'steam_id': sid, 'role_start': p.get('role')}

        # End roles
        for p in data.get('end_roles', []):
            sid = p.get('player_steamid')
            if sid:
                if sid not in players_dict:
                    players_dict[sid] = {'steam_id': sid}
                players_dict[sid]['role_end'] = p.get('role')

        for p_data in players_dict.values():
            new_player = RoundPlayer(
                round_id=new_round.id,
                steam_id=p_data['steam_id'],
                role_start=p_data.get('role_start'),
                role_end=p_data.get('role_end')
            )
            db.session.add(new_player)

        # Process Kills
        if 'kills' in data and isinstance(data['kills'], list):
            for k in data['kills']:
                new_kill = Kill(
                    round_id=new_round.id,
                    attacker_steamid=k.get('attacker_steamid'),
                    attacker_role=k.get('attacker_role'),
                    victim_steamid=k.get('victim_steamid'),
                    victim_role=k.get('victim_role'),
                    weapon=k.get('weapon'),
                    headshot=k.get('headshot', False)
                )
                db.session.add(new_kill)

        db.session.commit()
        return jsonify({'message': 'Stats collected successfully', 'round_id': new_round.id}), 201
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error saving stats: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    # Simple pagination or limit
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)

    rounds = Round.query.order_by(Round.timestamp.desc()).offset(offset).limit(limit).all()
    return jsonify([r.to_dict() for r in rounds])

if __name__ == '__main__':
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
    app.run(host='0.0.0.0', port=5000)
