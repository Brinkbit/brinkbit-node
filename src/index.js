const request = require( 'request' );
const bodyParser = require( 'body-parser' );
const pathToRegexp = require( 'path-to-regexp' );

module.exports = function createSDK( options ) {
    return [
        bodyParser.json(),
        function setPath( req, res, next ) {
            const headers = {};
            const body = req.body;
            if ( req.headers.authorization ) {
                headers.Authorization = req.headers.authorization;
            }
            if ( pathToRegexp( '/token/' ).test( req.path ) && body.grant_type === 'password' ) {
                body.client_id = body.client_id || options.gameId;
                body.client_secret = options.secretKey;
            }
            request({
                method: req.method,
                url: `${options.base || 'https://brinkbit.com'}/api/${options.apiVersion || '0.1'}${req.path}`,
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
};
