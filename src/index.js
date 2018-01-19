/* eslint-disable no-param-reassign */

const url = require( 'url' );
const Bluebird = require( 'bluebird' );
const eventEmitter = require( 'event-emitter' );
const Plugin = require( 'brinkbit-plugin' );
const normalizeArguments = require( 'brinkbit-plugin/src/validate/normalizeArguments' );
const normalizeResponse = require( 'brinkbit-plugin/src/validate/normalizeResponse' );
const validate = require( 'brinkbit-plugin/src/validate' );
const ValidationError = require( 'brinkbit-plugin/src/validate/validationError' );
const BrinkbitEvent = require( 'brinkbit-plugin/src/events' );
const request = require( 'request' );
const merge = require( 'lodash.merge' );

class Brinkbit {

    constructor( config ) {
        validate.constructor( config, {
            base: {
                dataType: 'string',
            },
            gameId: {
                dataType: 'string',
                presence: true,
            },
            secretKey: {
                dataType: 'string',
            },
            parse: {
                dataType: 'function',
            },
            scope: {
                dataType: 'array',
            },
        });
        this.gameId = config.gameId;
        const domain = typeof config.base !== 'string' ? 'https://brinkbit.com/api/0.1/' : config.base;
        this.domain = `${domain}${domain.slice( -1 ) !== '/' ? '/' : ''}`;
        this.base = `${this.domain}${this.gameId}/`;
        this.parse = config.parse ? config.parse : JSON.parse;
        this.scope = config.scope || [
            'player.basic_info:read',
            'player.basic_info:write',
            'data:read:write',
            'drm.key:write',
        ];

        this.use( Plugin.defaults );
    }

    createMiddleware() {
        return ( req, res, next ) => {
            const headers = {};
            if ( req.headers.authorization ) {
                headers.Authorization = req.headers.authorization;
            }
            const serviceRequest = request({
                method: req.method,
                url: `${this.base}${req.params[0].replace( `${this.gameId}/`, '' ).slice( 1 )}`,
                headers,
                qs: req.query,
            });
            serviceRequest.on( 'error', ( err ) => {
                next( err );
            });
            return req.pipe( serviceRequest ).pipe( res );
        };
    }

    resolveUrl( uri ) {
        return url.resolve( this.base, uri );
    }

    request( ...args ) {
        const options = normalizeArguments( ...args );
        return normalizeResponse( this._request( options ), options );
    }

    get( ...args ) {
        const options = normalizeArguments( ...args );
        return normalizeResponse( this._get( options ), options );
    }

    put( ...args ) {
        const options = normalizeArguments( ...args );
        return normalizeResponse( this._put( options ), options );
    }

    post( ...args ) {
        const options = normalizeArguments( ...args );
        return normalizeResponse( this._post( options ), options );
    }

    delete( ...args ) {
        const options = normalizeArguments( ...args );
        return normalizeResponse( this._delete( options ), options );
    }

    login( options, player ) {
        let token;
        const promise = Bluebird.any([
            validate( options, {
                email: {
                    dataType: 'string',
                },
                password: {
                    presence: true,
                },
                stayLoggedIn: {
                    dataType: 'boolean',
                },
            }),
            validate( options, {
                username: {
                    dataType: 'string',
                },
                password: {
                    presence: true,
                },
                stayLoggedIn: {
                    dataType: 'boolean',
                },
            }),
        ])
        .then(() => {
            const body = {
                grant_type: 'password',
                client_id: this.gameId,
                username: options.username || options.email,
                password: options.password,
                scope: this.scope.join( ' ' ),
            };
            return this._post({
                uri: './token/',
                body,
            });
        })
        .then(( response ) => {
            token = response.body.access_token;
            if ( options.stayLoggedIn ) {
                this.store( 'token', token );
            }
            return this._get( './playerinfo/', token );
        })
        .then(( response ) => {
            player = player || new this.Player();
            player.data = response.body;
            player.id = player.data._id;
            player.stayLoggedIn = options.stayLoggedIn;
            player.token = token;
            if ( !this.Player.primary ) {
                this.Player.primary = player;
                if ( options.stayLoggedIn ) {
                    this.store( 'playerId', player.id );
                }
            }
            this.emit( 'login', new BrinkbitEvent( 'login', player ));
            return player;
        });
        return normalizeResponse( promise, options );
    }

    isLoggedIn() {
        return !!this.Player.primary;
    }

    logout() {
        this.Player.primary = undefined;
    }

    forgot( data ) {
        if ( typeof data === 'string' ) {
            data = { emailOrUsername: data };
        }
        data.gameId = data.gameId || this.gameId;
        return Bluebird.any([
            validate( data, {
                gameId: {
                    dataType: 'string',
                    presence: true,
                },
                username: {
                    dataType: 'string',
                    presence: true,
                },
            }),
            validate( data, {
                gameId: {
                    dataType: 'string',
                    presence: true,
                },
                email: {
                    dataType: 'string',
                    presence: true,
                },
            }),
            validate( data, {
                gameId: {
                    dataType: 'string',
                    presence: true,
                },
                emailOrUsername: {
                    dataType: 'string',
                    presence: true,
                },
            }),
        ])
        .then(() => this.post({
            uri: './forgot/',
            body: data,
        }));
    }

    validateResetToken( data ) {
        if ( typeof data === 'string' ) {
            data = { token: data };
        }
        return validate( data, {
            token: {
                dataType: 'string',
                presence: true,
            },
        })
        .then(() => this.get({
            uri: `./reset/?token=${data.token}`,
        }));
    }

    promote( player ) {
        this.Player.primary = player;
    }

    use( plugin ) {
        if ( Array.isArray( plugin )) {
            plugin.forEach(( config ) => {
                this.initialize( config );
            });
        }
        else {
            this.initialize( plugin );
        }
    }

    initialize( plugin ) {
        validate.constructor( plugin, {
            type: {
                dataType: 'string',
                presence: true,
                inclusion: [
                    'player',
                    'game',
                    'core',
                ],
            },
            name: {
                dataType: 'string',
                presence: true,
            },
            initialize: {
                dataType: 'function',
                presence: true,
            },
        });
        if ( plugin.type === 'player' ) {
            if ( this.Player.prototype[plugin.name]) {
                throw new Error( `Brinkbit plugin namespace conflict: a core player method is named '${plugin.name}'. Please rename the plugin.` );
            }
            if ( this.Player.plugins.indexOf( plugin.name ) !== -1 ) {
                throw new Error( `Brinkbit plugin namespace conflict: two player plugins are named '${plugin.name}'. Please rename one of them.` );
            }
            this.Player.plugins.push( plugin );
            if ( this.Player.primary ) {
                this.Player.primary[plugin.name] = plugin.initialize( this, this.Player.primary );
            }
        }
        else {
            if ( this[plugin.name]) {
                throw new Error( `Brinkbit plugin namespace conflict: two plugins are named '${plugin.name}'. Please rename one of them.` );
            }
            this[plugin.name] = plugin.initialize( this );
        }
    }

    // private promise-driven api

    _request( options ) {
        return validate( options, {
            uri: {
                presence: true,
                dataType: 'string',
            },
        })
        .then(() => {
            options.uri = this.resolveUrl( options.uri );
            if ( options.method !== 'DELETE' ) {
                options.json = true;
            }
            if ( typeof options.body === 'object' ) {
                options.body = options.body;
            }
            const token = options.token;
            if ( token && options.passToken !== false ) {
                options.headers = merge( options.headers, {
                    Authorization: `Bearer ${token}`,
                });
            }
            return new Bluebird(( resolve, reject ) => {
                request( options, ( err, response, body ) => {
                    if (( err && !( err instanceof SyntaxError )) || response.statusCode >= 400 ) {
                        this.emit( 'error', response );
                        const error = new Error( 'HTTP error' );
                        error.response = response;
                        error.body = body;
                        return reject( error );
                    }
                    response.body = body;
                    this.emit( 'response', new BrinkbitEvent( 'response', response ));
                    return resolve( response );
                });
            });
        });
    }

    _get( ...args ) {
        const opts = merge({}, normalizeArguments( ...args ), {
            method: 'GET',
        });
        return this._request( opts );
    }

    _put( ...args ) {
        const opts = merge({}, normalizeArguments( ...args ), {
            method: 'PUT',
            json: true,
        });
        return this._request( opts );
    }

    _post( ...args ) {
        const opts = merge({}, normalizeArguments( ...args ), {
            method: 'POST',
            json: true,
        });
        return this._request( opts );
    }

    _delete( ...args ) {
        const opts = merge({}, normalizeArguments( ...args ), {
            method: 'DELETE',
        });
        return this._request( opts );
    }
}

Brinkbit.BrinkbitEvent = BrinkbitEvent;
Brinkbit.validate = validate;
Brinkbit.ValidationError = ValidationError;
Brinkbit.Plugin = Plugin;

eventEmitter( Brinkbit.prototype );

module.exports = Brinkbit;
