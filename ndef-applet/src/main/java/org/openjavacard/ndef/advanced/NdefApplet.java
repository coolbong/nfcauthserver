/*
 * openjavacard-ndef: JavaCard applet implementing an NDEF tag
 * Copyright (C) 2015-2018 Ingo Albrecht <copyright@promovicz.org>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301  USA
 */

package org.openjavacard.ndef.advanced;

import javacard.framework.APDU;
import javacard.framework.Applet;
import javacard.framework.ISO7816;
import javacard.framework.ISOException;
import javacard.framework.JCSystem;
import javacard.framework.Util;
import javacard.security.AESKey;
import javacard.security.KeyBuilder;
import javacardx.crypto.Cipher;

/**
 * \brief Applet implementing an NDEF type 4 tag
 *
 * Implemented to comply with:
 *   NFC Forum
 *   Type 4 Tag Operation Specification
 *   Version 2.0
 *
 * Conformity remarks:
 *   1. The NDEF data file can be up to 32767 bytes in size,
 *      corresponding to the specification maximum.
 *   2. No file control information (FCI) is returned in SELECT responses
 *      as allowed by specification requirement RQ_T4T_NDA_034.
 *   3. Proprietary access modes are being used for custom features,
 *      however they are not exposed in the capability descriptor.
 *   4. Proprietary files are not being used.
 *
 */
public final class NdefApplet extends Applet {

    /* Instructions */
    private static final byte INS_SELECT        = ISO7816.INS_SELECT;
    private static final byte INS_READ_BINARY   = (byte)0xB0;
    private static final byte INS_UPDATE_BINARY = (byte)0xD6;

    /* File IDs */
    private static final short FILEID_NONE              = (short)0x0000;
    private static final short FILEID_NDEF_CAPABILITIES = (short)0xE103;
    private static final short FILEID_NDEF_DATA         = (short)0xE104;

    /* File access specifications */
    private static final byte FILE_ACCESS_OPEN = (byte)0x00;
    private static final byte FILE_ACCESS_NONE = (byte)0xFF;
    private static final byte FILE_ACCESS_PROP_CONTACT_ONLY = (byte)0xF0;
    private static final byte FILE_ACCESS_PROP_WRITE_ONCE   = (byte)0xF1;

    /* Parameters for SELECT */
    private static final byte SELECT_P1_BY_FILEID     = (byte)0x00;
    private static final byte SELECT_P2_FIRST_OR_ONLY = (byte)0x0C;

    /* NDEF mapping version (specification 2.0) */
    private static final byte NDEF_MAPPING_VERSION = (byte)0x20;

    /* Install parameter tags */
    private static final byte AD_TAG_NDEF_DATA_INITIAL = (byte)0x80;
    private static final byte AD_TAG_NDEF_DATA_ACCESS  = (byte)0x81;
    private static final byte AD_TAG_NDEF_DATA_SIZE    = (byte)0x82;

    /* Constants related to capability container */
    private static final byte CC_LEN_HEADER = 7;
    private static final byte CC_OFF_NDEF_FILE_CONTROL = 0x07;
    private static final byte CC_TAG_NDEF_FILE_CONTROL = 0x04;
    private static final byte CC_LEN_NDEF_FILE_CONTROL = 6;

    /* Constants related to file control data in capabilities */
    private static final byte FC_OFF_FILE_ID      = 0x00;
    private static final byte FC_OFF_SIZE         = 0x02;
    private static final byte FC_OFF_READ_ACCESS  = 0x04;
    private static final byte FC_OFF_WRITE_ACCESS = 0x05;

    /**
     * Configuration: support for writing
     *
     * If disabled then no writing will be allowed after
     * initialization. Intended for use in combination
     * with install parameters.
     */
    private static final boolean FEATURE_WRITING = true;

    /**
     * Configuration: support for install parameters
     *
     * If enabled this will allow customization of the applet
     * during installation by using application parameters.
     *
     * Disabling this saves up to 600 bytes.
     */
    private static final boolean FEATURE_INSTALL_PARAMETERS = true;

    /**
     * Default NFC Authentication URL NDEF Record (installed as default)
     * URL: https://coolbong.github.io/nfcauthserver/?uid=00000000000000&cnt=000000&mac=0000000000000000&kid=1
     */
    private static final byte[] DEFAULT_NDEF_RECORD = {
        (byte)0xD1, (byte)0x01, (byte)0x5B, (byte)0x55, (byte)0x04,
        (byte)'c', (byte)'o', (byte)'o', (byte)'l', (byte)'b', (byte)'o', (byte)'n', (byte)'g',
        (byte)'.', (byte)'g', (byte)'i', (byte)'t', (byte)'h', (byte)'u', (byte)'b',
        (byte)'.', (byte)'i', (byte)'o', (byte)'/', (byte)'n', (byte)'f', (byte)'c',
        (byte)'a', (byte)'u', (byte)'t', (byte)'h', (byte)'s', (byte)'e', (byte)'r',
        (byte)'v', (byte)'e', (byte)'r', (byte)'/', (byte)'?', (byte)'u', (byte)'i',
        (byte)'d', (byte)'=', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0',
        (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0',
        (byte)'0', (byte)'0', (byte)'&', (byte)'c', (byte)'n', (byte)'t', (byte)'=',
        (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'&',
        (byte)'m', (byte)'a', (byte)'c', (byte)'=', (byte)'0', (byte)'0', (byte)'0',
        (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0',
        (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'0', (byte)'&',
        (byte)'k', (byte)'i', (byte)'d', (byte)'=', (byte)'1'
    };

    /**
     * NFC Authentication UID (7 bytes, registered in database: 04DE5F1EACC040)
     */
    private static final byte[] CARD_UID = {
        (byte)0x04, (byte)0xDE, (byte)0x5F, (byte)0x1E, (byte)0xAC, (byte)0xC0, (byte)0x40
    };

    /**
     * Hexadecimal characters lookup table
     */
    private static final byte[] HEX_CHARS = {
        (byte)'0', (byte)'1', (byte)'2', (byte)'3', (byte)'4', (byte)'5', (byte)'6', (byte)'7',
        (byte)'8', (byte)'9', (byte)'A', (byte)'B', (byte)'C', (byte)'D', (byte)'E', (byte)'F'
    };

    /** Offset in dataFile of UID placeholder (14 chars) */
    private static final short NDEF_DATA_OFF_UID = (short)45;
    private static final short NDEF_DATA_LEN_UID = (short)14;

    /** Offset in dataFile of Counter placeholder (6 chars) */
    private static final short NDEF_DATA_OFF_CNT = (short)64;
    private static final short NDEF_DATA_LEN_CNT = (short)6;

    /** Offset in dataFile of MAC placeholder (16 chars) */
    private static final short NDEF_DATA_OFF_MAC = (short)75;
    private static final short NDEF_DATA_LEN_MAC = (short)16;

    /**
     * Configuration: support advanced access restrictions
     *
     * If enabled the applet will support the special
     * access modes "contact only" as well as "write once".
     *
     * Disabling this saves about 170 bytes.
     */
    private static final boolean FEATURE_ADVANCED_ACCESS_CONTROL = true;

    /**
     * Configuration: maximum read block size
     */
    private static final short NDEF_MAX_READ = 128;

    /**
     * Configuration: maximum write block size
     */
    private static final short NDEF_MAX_WRITE = 128;

    /**
     * Configuration: maximum size of data file
     *
     * Two bytes are used for the record length,
     * the rest will be available for an NDEF record.
     */
    private static final short DEFAULT_NDEF_DATA_SIZE = 256;

    /**
     * Configuration: default read access for data file
     */
    private static final byte DEFAULT_NDEF_READ_ACCESS = FILE_ACCESS_OPEN;

    /**
     * Configuration: default write access for data file
     */
    private static final byte DEFAULT_NDEF_WRITE_ACCESS = FILE_ACCESS_OPEN;


    /** Transient variables */
    private short[] vars;
    /** Variable index for currently selected file */
    private static final byte VAR_SELECTED_FILE   = (byte)0;
    /** Variable index indicating whether counter was updated in current session */
    private static final byte VAR_COUNTER_UPDATED = (byte)1;
    /** Number of transient variables */
    private static final short NUM_VARS           = (short)2;

    /** 3-byte Big-Endian NFC Counter (persistent in EEPROM) */
    private final byte[] counter = new byte[] { (byte)0x00, (byte)0x00, (byte)0x00 };

    /** Master key (16 bytes, default 00s registered in DB) */
    private static final byte[] MASTER_KEY_BYTES = {
        (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00,
        (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00, (byte)0x00
    };

    /** AES Cipher instance */
    private final Cipher aesCipher;
    /** Master Key instance */
    private final AESKey masterKey;
    /** Session MAC Key instance */
    private final AESKey sessionKey;
    /** Transient buffer for MAC calculation (48 bytes: 16B block, 16B subkey, 16B SV2) */
    private final byte[] cryptoBuffer;

    /** NDEF capability file contents */
    private final byte[] capsFile;
    /** NDEF data file contents */
    private final byte[] dataFile;

    /** NDEF data read access policy */
    private final byte dataReadAccess;
    /** NDEF data write access policy */
    private final byte dataWriteAccess;

    /**
     * Installs an NDEF applet
     *
     * Will create, initialize and register an instance of
     * this applet as specified by the provided install data.
     *
     * Requested AID will always be honored.
     * Control information is ignored.
     * Applet data will be used for initialization.
     *
     * @param buf containing install data
     * @param off offset of install data in buf
     * @param len length of install data in buf
     */
    public static void install(byte[] buf, short off, byte len) {
        short pos = off;
        // find AID
        byte  lenAID = buf[pos++];
        short offAID = pos;
        pos += lenAID;
        // find control information (ignored)
        byte  lenCI = buf[pos++];
        short offCI = pos;
        pos += lenCI;
        // find applet data
        byte  lenAD = buf[pos++];
        short offAD = pos;
        pos += lenAD;

        // instantiate and initialize the applet
        NdefApplet applet = new NdefApplet(buf, offAD, lenAD);

        // register the applet
        applet.register(buf, offAID, lenAID);
    }

    /**
     * Main constructor
     *
     * This will construct and initialize an instance
     * of this applet according to the provided app data.
     *
     * @param buf containing application data
     * @param off offset of app data in buf
     * @param len length of app data in buf
     */
    protected NdefApplet(byte[] buf, short off, byte len) {

        short initSize = DEFAULT_NDEF_DATA_SIZE;
        byte initReadAccess = DEFAULT_NDEF_READ_ACCESS;
        byte initWriteAccess = DEFAULT_NDEF_WRITE_ACCESS;
        byte[] initBuf = null;
        short  initOff = 0;
        short  initLen = 0;

        // create variables
        vars = JCSystem.makeTransientShortArray(NUM_VARS, JCSystem.CLEAR_ON_DESELECT);

        // process application data
        if(FEATURE_INSTALL_PARAMETERS && len > 0) {
            // check TLV consistency
            if (UtilTLV.isTLVconsistent(buf, off, len)) {
                // DATA INITIAL
                short initTag = UtilTLV.findTag(buf, off, len, AD_TAG_NDEF_DATA_INITIAL);
                if (initTag >= 0) {
                    initBuf = buf;
                    initLen = UtilTLV.decodeLengthField(buf, (short) (initTag + 1));
                    initOff = (short) (initTag + 1 + UtilTLV.getLengthFieldLength(initLen));
                    // adjust size, can be overridden
                    if ((short) (2 + initLen) > initSize) {
                        initSize = (short) (2 + initLen);
                    }
                }

                // DATA ACCESS
                short tagAccess = UtilTLV.findTag(buf, off, len, AD_TAG_NDEF_DATA_ACCESS);
                if (tagAccess >= 0) {
                    short accessLen = UtilTLV.decodeLengthField(buf, (short) (tagAccess + 1));
                    if (accessLen != 2) {
                        ISOException.throwIt(ISO7816.SW_DATA_INVALID);
                    }
                    initReadAccess = buf[(short) (tagAccess + 2)];
                    initWriteAccess = buf[(short) (tagAccess + 3)];
                }

                // DATA SIZE
                short tagSize = UtilTLV.findTag(buf, off, len, AD_TAG_NDEF_DATA_SIZE);
                if (tagSize >= 0) {
                    short sizeLen = UtilTLV.decodeLengthField(buf, (short) (tagSize + 1));
                    if (sizeLen != 2) {
                        ISOException.throwIt(ISO7816.SW_DATA_INVALID);
                    }
                    initSize = Util.getShort(buf, (short) (tagSize + 2));
                    if (initSize < 0) {
                        ISOException.throwIt(ISO7816.SW_DATA_INVALID);
                    }
                }
            } else if (buf[off] == (byte) 0xD1) {
                // Raw NDEF Record directly provided as install parameter
                initBuf = buf;
                initOff = off;
                initLen = len;
                if ((short) (2 + initLen) > initSize) {
                    initSize = (short) (2 + initLen);
                }
            } else {
                ISOException.throwIt(ISO7816.SW_DATA_INVALID);
            }
        }

        // squash write access if not supported
        if(!FEATURE_WRITING) {
            initWriteAccess = FILE_ACCESS_NONE;
        }

        // set up access
        dataReadAccess = initReadAccess;
        dataWriteAccess = initWriteAccess;

        // create file contents
        capsFile = makeCaps(initSize, initReadAccess, initWriteAccess);
        dataFile = makeData(initSize, initBuf, initOff, initLen);

        // initialize cryptography objects
        aesCipher = Cipher.getInstance(Cipher.ALG_AES_BLOCK_128_ECB_NOPAD, false);
        masterKey = (AESKey)KeyBuilder.buildKey(KeyBuilder.TYPE_AES, KeyBuilder.LENGTH_AES_128, false);
        masterKey.setKey(MASTER_KEY_BYTES, (short)0);
        sessionKey = (AESKey)KeyBuilder.buildKey(KeyBuilder.TYPE_AES, KeyBuilder.LENGTH_AES_128, false);
        cryptoBuffer = JCSystem.makeTransientByteArray((short)48, JCSystem.CLEAR_ON_DESELECT);
    }

    /**
     * Create and initialize the CAPABILITIES file
     *
     * @param dataSize to be allocated
     * @param dataReadAccess to put in the CC
     * @param dataWriteAccess to put in the CC
     * @return an array for use as the CC file
     */
    private byte[] makeCaps(short dataSize,
                            byte dataReadAccess, byte dataWriteAccess) {
        short capsLen = (short)(CC_LEN_HEADER + 2 + CC_LEN_NDEF_FILE_CONTROL);
        byte[] caps = new byte[capsLen];

        short pos = 0;

        // CC length
        pos = Util.setShort(caps, pos, capsLen);
        // mapping version
        caps[pos++] = NDEF_MAPPING_VERSION;
        // maximum read size
        pos = Util.setShort(caps, pos, NDEF_MAX_READ);
        // maximum write size
        pos = Util.setShort(caps, pos, NDEF_MAX_WRITE);

        // NDEF File Control TLV
        caps[pos++] = CC_TAG_NDEF_FILE_CONTROL;
        caps[pos++] = CC_LEN_NDEF_FILE_CONTROL;
        // file ID
        pos = Util.setShort(caps, pos, FILEID_NDEF_DATA);
        // file size
        pos = Util.setShort(caps, pos, dataSize);
        // read access
        caps[pos++] = dataReadAccess;
        // write access
        caps[pos++] = dataWriteAccess;

        // check consistency
        if(pos != capsLen) {
            ISOException.throwIt(ISO7816.SW_UNKNOWN);
        }

        // return the file
        return caps;
    }

    /**
     * Create and initialize the DATA file
     *
     * @param dataSize to be allocated
     * @param init buffer containing initial data
     * @param initOff offset of initial data in buffer
     * @param initLen length of initial data in buffer
     * @return an array for use as the data file
     */
    private byte[] makeData(short dataSize, byte[] init, short initOff, short initLen) {
        byte[] data = new byte[dataSize];

        // initialize from init, if provided
        if (init != null && initLen > 0) {
            // container size
            Util.setShort(data, (short) 0, initLen);
            // initial data
            Util.arrayCopyNonAtomic(init, initOff, data, (short) 2, initLen);
        } else {
            // Default initial data: NFC Authentication URL set at install time
            short defaultLen = (short) DEFAULT_NDEF_RECORD.length;
            Util.setShort(data, (short) 0, defaultLen);
            Util.arrayCopyNonAtomic(DEFAULT_NDEF_RECORD, (short) 0, data, (short) 2, defaultLen);
        }

        return data;
    }

    /**
     * Fix up a capability container
     *
     * This will be called to fix up capabilities before
     * they are actually sent out to the host device.
     *
     * Currently this only fixes up the access policies
     * so as to hide our proprietary policies.
     *
     * @param caps buffer containing CC to fix
     * @param off offset of CC in buffer
     * @param len of CC in buffer
     */
    private void fixCaps(byte[] caps, short off, short len) {
        if(FEATURE_ADVANCED_ACCESS_CONTROL) {
            short offNFC = (short) (off + CC_OFF_NDEF_FILE_CONTROL + 2);
            short offR = (short) (offNFC + FC_OFF_READ_ACCESS);
            short offW = (short) (offNFC + FC_OFF_WRITE_ACCESS);
            caps[offR] = fixAccess(dataFile, dataReadAccess);
            caps[offW] = fixAccess(dataFile, dataWriteAccess);
        }
    }

    /**
     * Formats bytes into ASCII hexadecimal characters in dst buffer
     */
    private static void formatHex(byte[] src, short srcOff, short srcLen, byte[] dst, short dstOff) {
        for (short i = 0; i < srcLen; i++) {
            short b = (short)(src[(short)(srcOff + i)] & 0xFF);
            dst[(short)(dstOff + (short)(i * 2))]     = HEX_CHARS[(short)((b >>> 4) & 0x0F)];
            dst[(short)(dstOff + (short)(i * 2 + 1))] = HEX_CHARS[(short)(b & 0x0F)];
        }
    }

    /**
     * Increments the 3-byte Big-Endian counter
     */
    private void incrementCounter() {
        for (short i = 2; i >= 0; i--) {
            short val = (short)((counter[i] & 0xFF) + 1);
            counter[i] = (byte)val;
            if (counter[i] != 0) {
                break;
            }
        }
    }

    /**
     * Shifts 16 bytes left by 1 bit in place (from src to dst).
     * Returns true if the original MSB was 1.
     */
    private boolean shiftLeftOneBit(byte[] src, short srcOff, byte[] dst, short dstOff) {
        short carry = 0;
        boolean msb = (src[srcOff] & (byte)0x80) != 0;
        for (short i = 15; i >= 0; i--) {
            short b = (short)(src[(short)(srcOff + i)] & 0xFF);
            short nextCarry = (short)((b & 0x80) != 0 ? 1 : 0);
            dst[(short)(dstOff + i)] = (byte)(((b << 1) & 0xFF) | carry);
            carry = nextCarry;
        }
        return msb;
    }

    /**
     * Computes NFC Authentication SDMMAC (AES-128-CMAC with truncation)
     * and writes 16 hexadecimal ASCII characters into dst at dstOff.
     */
    private void computeMac(byte[] dst, short dstOff) {
        short offBlock = 0;
        short offSubkey = 16;
        short offSv2 = 32;

        // 1. Build SV2 (16 bytes): [3C C3 00 01 00 80] || UID(7B) || CNT_LSB(3B)
        cryptoBuffer[offSv2]               = (byte)0x3C;
        cryptoBuffer[(short)(offSv2 + 1)] = (byte)0xC3;
        cryptoBuffer[(short)(offSv2 + 2)] = (byte)0x00;
        cryptoBuffer[(short)(offSv2 + 3)] = (byte)0x01;
        cryptoBuffer[(short)(offSv2 + 4)] = (byte)0x00;
        cryptoBuffer[(short)(offSv2 + 5)] = (byte)0x80;
        Util.arrayCopyNonAtomic(CARD_UID, (short)0, cryptoBuffer, (short)(offSv2 + 6), (short)7);
        // Counter is stored Big-Endian in counter[0..2]. LSB-first is counter[2], counter[1], counter[0].
        cryptoBuffer[(short)(offSv2 + 13)] = counter[2];
        cryptoBuffer[(short)(offSv2 + 14)] = counter[1];
        cryptoBuffer[(short)(offSv2 + 15)] = counter[0];

        // 2. Derive K1 for Master Key
        // L = AES(MasterKey, 0^16)
        Util.arrayFillNonAtomic(cryptoBuffer, offBlock, (short)16, (byte)0);
        aesCipher.init(masterKey, Cipher.MODE_ENCRYPT);
        aesCipher.doFinal(cryptoBuffer, offBlock, (short)16, cryptoBuffer, offBlock);
        // Shift L to get K1 in offSubkey
        boolean msb = shiftLeftOneBit(cryptoBuffer, offBlock, cryptoBuffer, offSubkey);
        if (msb) {
            cryptoBuffer[(short)(offSubkey + 15)] ^= (byte)0x87;
        }

        // 3. Session MAC Key = AES(MasterKey, SV2 ^ K1)
        for (short i = 0; i < 16; i++) {
            cryptoBuffer[(short)(offBlock + i)] = (byte)(cryptoBuffer[(short)(offSv2 + i)] ^ cryptoBuffer[(short)(offSubkey + i)]);
        }
        aesCipher.init(masterKey, Cipher.MODE_ENCRYPT);
        aesCipher.doFinal(cryptoBuffer, offBlock, (short)16, cryptoBuffer, offBlock);
        // cryptoBuffer[offBlock..offBlock+15] is now sessionMacKey
        sessionKey.setKey(cryptoBuffer, offBlock);

        // 4. Derive K2 for Session MAC Key
        // L_session = AES(SessionKey, 0^16)
        Util.arrayFillNonAtomic(cryptoBuffer, offBlock, (short)16, (byte)0);
        aesCipher.init(sessionKey, Cipher.MODE_ENCRYPT);
        aesCipher.doFinal(cryptoBuffer, offBlock, (short)16, cryptoBuffer, offBlock);
        // Shift L_session to get K1_session in offSubkey
        msb = shiftLeftOneBit(cryptoBuffer, offBlock, cryptoBuffer, offSubkey);
        if (msb) {
            cryptoBuffer[(short)(offSubkey + 15)] ^= (byte)0x87;
        }
        // Shift K1_session to get K2_session in offBlock
        msb = shiftLeftOneBit(cryptoBuffer, offSubkey, cryptoBuffer, offBlock);
        if (msb) {
            cryptoBuffer[(short)(offBlock + 15)] ^= (byte)0x87;
        }

        // 5. Full CMAC = AES(SessionKey, Pad(empty) ^ K2)
        // Pad(empty) = [0x80, 0, 0, ..., 0] -> Pad ^ K2 means flipping bit 7 of byte 0
        cryptoBuffer[offBlock] ^= (byte)0x80;
        aesCipher.init(sessionKey, Cipher.MODE_ENCRYPT);
        aesCipher.doFinal(cryptoBuffer, offBlock, (short)16, cryptoBuffer, offBlock);
        // cryptoBuffer[offBlock..offBlock+15] is now fullCmac

        // 6. Truncate MAC: pick odd indices (1, 3, 5, 7, 9, 11, 13, 15) and format as Hex (16 chars)
        for (short i = 0; i < 8; i++) {
            short b = (short)(cryptoBuffer[(short)(offBlock + (short)(i * 2 + 1))] & 0xFF);
            dst[(short)(dstOff + (short)(i * 2))]     = HEX_CHARS[(short)((b >>> 4) & 0x0F)];
            dst[(short)(dstOff + (short)(i * 2 + 1))] = HEX_CHARS[(short)(b & 0x0F)];
        }
    }

    @Override
    public void deselect() {
        vars[VAR_SELECTED_FILE] = FILEID_NONE;
        vars[VAR_COUNTER_UPDATED] = 0;
    }

    /**
     * Process an APDU
     *
     * This is the outer layer of our APDU dispatch.
     *
     * It deals with the CLA and INS of the APDU,
     * leaving the rest to an INS-specific function.
     *
     * @param apdu to be processed
     * @throws ISOException on error
     */
    public final void process(APDU apdu) throws ISOException {
        byte[] buffer = apdu.getBuffer();
        byte ins = buffer[ISO7816.OFFSET_INS];

        // handle selection of the applet
        if(selectingApplet()) {
            vars[VAR_SELECTED_FILE] = FILEID_NONE;
            vars[VAR_COUNTER_UPDATED] = 0;
            return;
        }

        // secure messaging is not supported
        if(buffer[ISO7816.OFFSET_CLA] != 0) {
            //ISOException.throwIt(ISO7816.SW_SECURE_MESSAGING_NOT_SUPPORTED);
            ISOException.throwIt((short)0x6882);
        }

        // process commands to the applet
        if(apdu.isISOInterindustryCLA()) {
            if (ins == INS_SELECT) {
                processSelect(apdu);
            } else if (ins == INS_READ_BINARY) {
                processReadBinary(apdu);
            } else if (ins == INS_UPDATE_BINARY) {
                if(FEATURE_WRITING) {
                    processUpdateBinary(apdu);
                } else {
                    ISOException.throwIt(ISO7816.SW_COMMAND_NOT_ALLOWED);
                }
            } else {
                ISOException.throwIt(ISO7816.SW_INS_NOT_SUPPORTED);
            }
        } else {
            ISOException.throwIt(ISO7816.SW_CLA_NOT_SUPPORTED);
        }
    }

    /**
     * Process a SELECT command
     *
     * This handles only the one case mandated by the NDEF
     * specification: SELECT FIRST-OR-ONLY BY-FILE-ID.
     *
     * The file ID is specified in the APDU contents. It
     * must be exactly two bytes long and also valid.
     *
     * @param apdu to process
     * @throws ISOException on error
     */
    private void processSelect(APDU apdu) throws ISOException {
        byte[] buffer = apdu.getBuffer();
        byte p1 = buffer[ISO7816.OFFSET_P1];
        byte p2 = buffer[ISO7816.OFFSET_P2];

        // we only support what the NDEF spec prescribes
        if(p1 != SELECT_P1_BY_FILEID || p2 != SELECT_P2_FIRST_OR_ONLY) {
            ISOException.throwIt(ISO7816.SW_FUNC_NOT_SUPPORTED);
        }

        // receive data
        short lc = apdu.setIncomingAndReceive();
        if (lc == 0) {
            lc = (short) (buffer[ISO7816.OFFSET_LC] & 0xFF);
        }

        // check length, must be for a file ID
        if(lc != 2) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        // retrieve the file ID
        short fileId = Util.getShort(buffer, ISO7816.OFFSET_CDATA);

        // perform selection if the ID is valid
        if(fileId == FILEID_NDEF_CAPABILITIES || fileId == FILEID_NDEF_DATA) {
            vars[VAR_SELECTED_FILE] = fileId;
            if(fileId == FILEID_NDEF_DATA) {
                vars[VAR_COUNTER_UPDATED] = 0;
            }
        } else {
            ISOException.throwIt(ISO7816.SW_FILE_NOT_FOUND);
        }
    }

    /**
     * Process a READ BINARY command
     *
     * This supports simple reads at any offset.
     *
     * The length of the returned data is limited
     * by the maximum R-APDU length as well as by
     * the maximum read size NDEF_MAX_READ.
     *
     * @param apdu to process
     * @throws ISOException on error
     */
    private void processReadBinary(APDU apdu) throws ISOException {
        byte[] buffer = apdu.getBuffer();

        // access the file
        byte[] file = accessFileForRead(vars[VAR_SELECTED_FILE]);

        // get and check the read offset
        short offset = Util.getShort(buffer, ISO7816.OFFSET_P1);
        if(offset < 0 || offset >= file.length) {
            ISOException.throwIt(ISO7816.SW_WRONG_P1P2);
        }

        // determine the output size
        short le = apdu.setOutgoingNoChaining();
        if(le > NDEF_MAX_READ) {
            le = NDEF_MAX_READ;
        }

        // adjust for end of file
        short limit = (short)(offset + le);
        if(limit < 0) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }
        if(limit >= file.length) {
            le = (short)(file.length - offset);
        }

        // send the requested data
        if(vars[VAR_SELECTED_FILE] == FILEID_NDEF_CAPABILITIES) {
            // send fixed capabilities
            Util.arrayCopyNonAtomic(file, (short)0,
                                    buffer, (short)0,
                                    (short)file.length);
            fixCaps(buffer, (short)0, (short)file.length);
            apdu.setOutgoingLength(le);
            apdu.sendBytesLong(buffer, offset, le);
        } else if(vars[VAR_SELECTED_FILE] == FILEID_NDEF_DATA) {
            // 1. Increment counter once per session
            if (vars[VAR_COUNTER_UPDATED] == 0) {
                incrementCounter();
                vars[VAR_COUNTER_UPDATED] = 1;
            }

            // 2. Copy NDEF data file to APDU buffer
            short totalNdefLen = (short)(Util.getShort(file, (short)0) + 2);
            if (totalNdefLen > (short)buffer.length) {
                totalNdefLen = (short)buffer.length;
            }
            Util.arrayCopyNonAtomic(file, (short)0, buffer, (short)0, totalNdefLen);

            // 3. Mirror UID (14 hex chars)
            formatHex(CARD_UID, (short)0, (short)CARD_UID.length, buffer, NDEF_DATA_OFF_UID);

            // 4. Mirror Counter (3-byte Big-Endian -> 6 hex chars)
            formatHex(counter, (short)0, (short)counter.length, buffer, NDEF_DATA_OFF_CNT);

            // 5. Compute & Mirror MAC (8-byte truncated CMAC -> 16 hex chars)
            computeMac(buffer, NDEF_DATA_OFF_MAC);

            // 6. Send requested portion from APDU buffer
            apdu.setOutgoingLength(le);
            apdu.sendBytesLong(buffer, offset, le);
        } else {
            // send directly
            apdu.setOutgoingLength(le);
            apdu.sendBytesLong(file, offset, le);
        }
    }

    /**
     * Process an UPDATE BINARY command
     *
     * Supports simple writes at any offset.
     *
     * The amount of data that can be written in one
     * operation is limited both by maximum C-APDU
     * length and the maximum write size NDEF_MAX_WRITE.
     *
     * @param apdu to process
     * @throws ISOException on error
     */
    private void processUpdateBinary(APDU apdu) throws ISOException {
        byte[] buffer = apdu.getBuffer();

        // access the file
        byte[] file = accessFileForWrite(vars[VAR_SELECTED_FILE]);

        // get and check the write offset
        short offset = Util.getShort(buffer, ISO7816.OFFSET_P1);
        if(offset < 0 || offset >= file.length) {
            ISOException.throwIt(ISO7816.SW_WRONG_P1P2);
        }

        // receive data
        short lc = apdu.setIncomingAndReceive();
        if (lc == 0) {
            lc = (short) (buffer[ISO7816.OFFSET_LC] & 0xFF);
        }

        // check the input size
        if(lc > NDEF_MAX_WRITE) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        // file limit checks
        short limit = (short)(offset + lc);
        if(limit < 0 || limit >= file.length) {
            ISOException.throwIt(ISO7816.SW_WRONG_LENGTH);
        }

        // perform the update
        Util.arrayCopy(buffer, ISO7816.OFFSET_CDATA, file, offset, lc);
    }

    /**
     * Check if file access should be granted
     *
     * This will perform all necessary checks to determine
     * if an operation can currently be allowed within the
     * policy specified in ACCESS.
     *
     * @param access policy to be checked
     * @return true if access granted, false otherwise
     */
    private boolean checkAccess(byte[] data, byte access) {
        if(!FEATURE_ADVANCED_ACCESS_CONTROL) {
            // simple access control
            return access == FILE_ACCESS_OPEN;
        } else {
            // get protocol and media information
            byte protocol = APDU.getProtocol();
            byte media = (byte) (protocol & APDU.PROTOCOL_MEDIA_MASK);
            // make the decision
            switch (access) {
                case FILE_ACCESS_OPEN:
                    return true;
                case FILE_ACCESS_PROP_CONTACT_ONLY:
                    return media == APDU.PROTOCOL_MEDIA_DEFAULT;
                case FILE_ACCESS_PROP_WRITE_ONCE:
                    return data[0] == 0 && data[1] == 0;
                default:
                case FILE_ACCESS_NONE:
                    return false;
            }
        }
    }

    /**
     * Fix up an access policy to reflect current state
     *
     * This is used to squash our custom access policies
     * so that we do not have to present a proprietary
     * policy to unsuspecting host devices.
     *
     * @param data of the file for which to fix
     * @param access policy for to fix
     * @return a fixed access policy
     */
    private byte fixAccess(byte[] data, byte access) {
        // figure out the right policy
        switch(access) {
            // by default we pass through
            default:
                return access;
            // these two require fixing
            case FILE_ACCESS_PROP_CONTACT_ONLY:
            case FILE_ACCESS_PROP_WRITE_ONCE:
                return (checkAccess(data, access))
                        ? FILE_ACCESS_OPEN : FILE_ACCESS_NONE;
        }
    }

    /**
     * Access a file for reading
     *
     * This function serves to perform precondition checks
     * before actually operating on a file in a read operation.
     *
     * If this function succeeds then the given fileId was
     * valid, security access has been granted and reading
     * of data for this file is possible.
     *
     * @param fileId of the file to be read
     * @return data array of the file
     * @throws ISOException on error
     */
    private byte[] accessFileForRead(short fileId) throws ISOException {
        byte[] file = null;
        byte access = FILE_ACCESS_NONE;
        // select relevant data
        if(fileId == FILEID_NDEF_CAPABILITIES) {
            file = capsFile;
            access = FILE_ACCESS_OPEN;
        }
        if(fileId == FILEID_NDEF_DATA) {
            file = dataFile;
            access = dataReadAccess;
        }
        // check that we got anything
        if(file == null) {
            ISOException.throwIt(ISO7816.SW_CONDITIONS_NOT_SATISFIED);
        }
        // perform access checks
        if(!checkAccess(file, access)) {
            ISOException.throwIt(ISO7816.SW_SECURITY_STATUS_NOT_SATISFIED);
        }
        return file;
    }

    /**
     * Access a file for writing
     *
     * This function serves to perform precondition checks
     * before actually operating on a file in a write operation.
     *
     * If this function succeeds then the given fileId was
     * valid, security access has been granted and writing
     * of data for this file is possible.
     *
     * @param fileId of the file to be written
     * @return data array of the file
     * @throws ISOException on error
     */
    private byte[] accessFileForWrite(short fileId) throws ISOException {
        byte[] file = null;
        byte access = FILE_ACCESS_NONE;
        // CC can not be written
        if(fileId == FILEID_NDEF_CAPABILITIES) {
            ISOException.throwIt(ISO7816.SW_FUNC_NOT_SUPPORTED);
        }
        // select relevant data
        if(fileId == FILEID_NDEF_DATA) {
            file = dataFile;
            access = dataWriteAccess;
        }
        // check that we got something
        if(file == null) {
            ISOException.throwIt(ISO7816.SW_CONDITIONS_NOT_SATISFIED);
        }
        // perform access checks
        if(!checkAccess(file, access)) {
            ISOException.throwIt(ISO7816.SW_SECURITY_STATUS_NOT_SATISFIED);
        }
        return file;
    }

}
