const middleware = require( '../src' );
const expect = require( 'chai' ).expect;
const bodyParser = require( 'body-parser' );
const express = require( 'express' );
const env = require( '../env' );
const supertest = require( 'supertest-session' );
require( 'chai/register-expect' );

describe( 'sdk', function() {
    before( function( done ) {
        this.app = express();
        this.app.use( bodyParser.json());
        this.app.use( bodyParser.urlencoded({ extended: true }));
        this.app.use( '/api', middleware( env.config ));
        this.app.listen( env.port, () => {
            done();
        });
    });

    it( 'should expose a function', function() {
        expect( middleware ).to.be.a( 'function' );
    });

    it( 'should accept a config and return an express middleware array', function() {
        expect( middleware({})).to.be.an( 'array' );
    });

    it( 'should forward password token grant requests and add secret', function() {
        const session = supertest( this.app );
        return session.post( '/api/token' )
        .send({
            username: env.user.username,
            password: env.user.password,
            scope: 'player.basic_info:read player.basic_info:write data:read:write',
            grant_type: 'password',
        })
        .expect( 200 )
        .expect(( res ) => {
            expect( res.body.access_token ).to.exist;
            expect( res.body.token_type ).to.equal( 'Bearer' );
        })
        .exec();
    });
});
