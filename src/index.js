const request = require( 'request' );
const bodyParser = require( 'body-parser' );
const pathToRegexp = require( 'path-to-regexp' );
const merge = require( 'lodash.merge' );
const validate = require( 'validate.js' );

validate.validators.dataType = function validateDataType( value, options ) {
    return ( value === null || value === undefined || validate[`is${validate.capitalize( options )}`]( value )) ? null : `is not of type ${options}`;
};

module.exports = class Brinkbit {

    constructor( options ) {
        validate( options, {
            gameId: {
                dataType: 'string',
                presence: true,
            },
            secretKey: {
                dataType: 'string',
                presence: true,
            },
            base: {
                dataType: 'string',
            },
            scope: {
                dataType: 'string',
            },
        });
        this.options = options;
    }

    createMiddleware( options ) {
        const opts = merge({}, this.options, options );
        return [
            bodyParser.json(),
            ( req, res, next ) => {
                if ( this.access_token ) {
                    return next();
                }
                request({
                    method: 'post',
                    url: `${opts.base || 'https://brinkbit.com'}/api/${opts.apiVersion || '0.1'}/token/`,
                    form: {
                        client_id: req.body.client_id || opts.gameId,
                        client_secret: opts.secretKey,
                        grant_type: 'client_credentials',
                        scope: opts.scope || 'player:create data:read:write',
                    },
                    json: true,
                }, ( error, response, body ) => {
                    if ( body && body.access_token ) {
                        this.access_token = body.access_token;
                    }
                    next();
                });
            },
            ( req, res, next ) => {
                const headers = {};
                const body = req.body;
                if ( req.headers.authorization ) {
                    headers.Authorization = req.headers.authorization;
                }
                else {
                    headers.Authorization = `Bearer ${this.access_token}`;
                }
                if ( pathToRegexp( '/token/' ).test( req.path ) && body.grant_type === 'password' ) {
                    body.client_id = body.client_id || opts.gameId;
                    body.client_secret = opts.secretKey;
                }
                request({
                    method: req.method,
                    url: `${opts.base || 'https://brinkbit.com'}/api/${opts.apiVersion || '0.1'}${req.path}`,
                    headers,
                    form: body,
                    json: true,
                }, ( error, response, body ) => {
                    if ( error ) {
                        next( error );
                    }
                    else {
                        res.set( response.headers );
                        res.status( response.statusCode );
                        res.send( body );
                    }
                });
            },
        ];
    }
}
