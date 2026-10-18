package com.orca.nfcauth.util

import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

/**
 * NFC Authentication (AES-128-CMAC, NIST SP 800-38B, SV2 Session Key Derivation) 암호 유틸리티
 */
object CryptoUtil {
    private const val CONST_RB = 0x87.toByte()

    fun hexToBytes(hex: String): ByteArray {
        val clean = hex.trim().removePrefix("0x").removePrefix("0X")
        val result = ByteArray(clean.length / 2)
        for (i in result.indices) {
            result[i] = clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return result
    }

    fun bytesToHex(bytes: ByteArray): String {
        val sb = StringBuilder()
        for (b in bytes) {
            sb.append(String.format("%02X", b))
        }
        return sb.toString()
    }

    private fun aes128EcbEncryptBlock(key: ByteArray, block: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/ECB/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"))
        return cipher.doFinal(block)
    }

    private fun shiftLeftOneBit(src: ByteArray): Pair<ByteArray, Boolean> {
        val dst = ByteArray(16)
        var carry = 0
        for (i in 15 downTo 0) {
            val byteVal = src[i].toInt() and 0xFF
            val nextCarry = if ((byteVal and 0x80) != 0) 1 else 0
            dst[i] = (((byteVal shl 1) and 0xFF) or carry).toByte()
            carry = nextCarry
        }
        val msb = (src[0].toInt() and 0x80) != 0
        return Pair(dst, msb)
    }

    private fun generateCmacSubkeys(key: ByteArray): Pair<ByteArray, ByteArray> {
        val zeroBlock = ByteArray(16)
        val l = aes128EcbEncryptBlock(key, zeroBlock)
        val (shiftedL, msbL) = shiftLeftOneBit(l)
        val k1 = shiftedL.copyOf()
        if (msbL) {
            k1[15] = (k1[15].toInt() xor CONST_RB.toInt()).toByte()
        }
        val (shiftedK1, msbK1) = shiftLeftOneBit(k1)
        val k2 = shiftedK1.copyOf()
        if (msbK1) {
            k2[15] = (k2[15].toInt() xor CONST_RB.toInt()).toByte()
        }
        return Pair(k1, k2)
    }

    fun calculateAes128Cmac(key: ByteArray, message: ByteArray): ByteArray {
        val (k1, k2) = generateCmacSubkeys(key)
        val blockSize = 16
        val msgLen = message.size
        val n = if (msgLen == 0) 1 else (msgLen + blockSize - 1) / blockSize
        val isComplete = msgLen > 0 && msgLen % blockSize == 0

        val lastBlock = ByteArray(blockSize)
        if (isComplete) {
            val srcOffset = (n - 1) * blockSize
            for (i in 0 until blockSize) {
                lastBlock[i] = (message[srcOffset + i].toInt() xor k1[i].toInt()).toByte()
            }
        } else {
            val offset = (n - 1) * blockSize
            val remaining = msgLen - offset
            for (i in 0 until remaining) {
                lastBlock[i] = message[offset + i]
            }
            lastBlock[remaining] = 0x80.toByte()
            for (i in (remaining + 1) until blockSize) {
                lastBlock[i] = 0.toByte()
            }
            for (i in 0 until blockSize) {
                lastBlock[i] = (lastBlock[i].toInt() xor k2[i].toInt()).toByte()
            }
        }

        var x = ByteArray(blockSize)
        for (i in 0 until (n - 1)) {
            val y = ByteArray(blockSize)
            val offset = i * blockSize
            for (j in 0 until blockSize) {
                y[j] = (x[j].toInt() xor message[offset + j].toInt()).toByte()
            }
            x = aes128EcbEncryptBlock(key, y)
        }

        val finalY = ByteArray(blockSize)
        for (j in 0 until blockSize) {
            finalY[j] = (x[j].toInt() xor lastBlock[j].toInt()).toByte()
        }
        return aes128EcbEncryptBlock(key, finalY)
    }

    fun truncateMac(cmac16Bytes: ByteArray): ByteArray {
        val macT = ByteArray(8)
        var j = 0
        for (i in 0 until 16) {
            if (i % 2 != 0) {
                macT[j++] = cmac16Bytes[i]
            }
        }
        return macT
    }

    fun buildSV2(uid: ByteArray, counterLsb: ByteArray): ByteArray {
        val header = byteArrayOf(0x3C.toByte(), 0xC3.toByte(), 0x00, 0x01, 0x00, 0x80.toByte())
        val out = ByteArray(16)
        System.arraycopy(header, 0, out, 0, 6)
        System.arraycopy(uid, 0, out, 6, 7)
        System.arraycopy(counterLsb, 0, out, 13, 3)
        return out
    }

    /**
     * UID와 3바이트 카운터(정수), 마스터키로부터 유효한 8바이트 SDMMAC(Hex 문자열) 계산
     */
    fun computeSdmMac(
        uidHex: String,
        counterInt: Int,
        keyHex: String = "00000000000000000000000000000000"
    ): String {
        val uid = hexToBytes(uidHex)
        val key = hexToBytes(keyHex)
        val counterLsb = byteArrayOf(
            (counterInt and 0xFF).toByte(),
            ((counterInt shr 8) and 0xFF).toByte(),
            ((counterInt shr 16) and 0xFF).toByte()
        )
        val sv2 = buildSV2(uid, counterLsb)
        val sessionMacKey = calculateAes128Cmac(key, sv2)
        val fullCmac = calculateAes128Cmac(sessionMacKey, ByteArray(0))
        return bytesToHex(truncateMac(fullCmac))
    }
}
