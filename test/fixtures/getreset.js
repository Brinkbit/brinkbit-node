const shell = require( 'shelljs' );

module.exports = function getreset( env ) {
    return new Promise(( resolve, reject ) => {
        shell.exec( env.server.getreset, { async: true, cwd: env.server.cwd, silent: true }, ( code, stdout, stderr ) => {
            if ( code ) {
                reject( stderr );
            }
            else {
                resolve( stdout.replace( /\n/g, '' ));
            }
        });
    });
};
