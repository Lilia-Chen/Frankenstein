
const THREE = require('three');

function test() {
    // Basis: -90 deg X
    const basis = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'));
    const basisInv = basis.clone().invert();

    function zUpToYUp(x, y, z, w) {
        const q = new THREE.Quaternion(x, y, z, w);
        // q' = basis * q * basisInv
        const r = new THREE.Quaternion().copy(q);
        r.premultiply(basis);
        r.multiply(basisInv);
        return r;
    }

    console.log("Basis:", basis.toArray());

    // Test Identity (0,0,0,1)
    const id = zUpToYUp(0, 0, 0, 1);
    console.log("Identity ->", id.toArray());

    // Test 90 deg around Z (Z-up: Spin around vertical axis)
    // Should become 90 deg around Y (Y-up: Spin around vertical axis)
    const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI/2);
    const resZ = zUpToYUp(rotZ.x, rotZ.y, rotZ.z, rotZ.w);
    console.log("RotZ(90) input:", rotZ.toArray());
    console.log("RotZ(90) output:", resZ.toArray());

    // Expected Output for RotZ(90): 
    // Axis (0,0,1) -> (0,1,0). Angle 90.
    const expectedY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI/2);
    console.log("Expected Y(90):", expectedY.toArray());
}

test();
