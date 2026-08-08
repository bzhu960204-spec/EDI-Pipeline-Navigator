<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:cdm="http://esb.dsv.com/CDM/DocumentMessage_V2"
    exclude-result-prefixes="cdm">
    <xsl:output method="xml" omit-xml-declaration="yes"/>

    <xsl:param name="SOURCE_ID"/>
    <xsl:param name="DESTINATION_ID"/>
    <xsl:param name="DOCUMENT_TYPE"/>
    <xsl:param name="FORMAT"/>
    <xsl:param name="STANDARD"/>
    <xsl:param name="VERSION"/>
    <xsl:template match="/cdm:DocumentMessage">
        <Route>
            <xsl:variable name="messageType"
                select="cdm:Header/cdm:MessageType"/>
            <xsl:choose>
                <xsl:when test="contains($messageType,'SSMBLNYU')">
                    <DOCUMENT_TYPE>RECEIPT CONFIRMATION</DOCUMENT_TYPE>
                </xsl:when>
                <xsl:when test="contains($messageType,'SSMBLZAI')">
                    <DOCUMENT_TYPE>INVENTORY BALANCE</DOCUMENT_TYPE>
                </xsl:when>
                <xsl:otherwise>
                    <DOCUMENT_TYPE>
                        <xsl:value-of select="$messageType"/>
                    </DOCUMENT_TYPE>
                </xsl:otherwise>
            </xsl:choose>
            <SOURCE_ID>DSV.WMS.NGW</SOURCE_ID>
            <DESTINATION_ID>JP-MBL</DESTINATION_ID>
            <FORMAT>XML</FORMAT>
            <STANDARD>CDM</STANDARD>
            <VERSION>2.0</VERSION>
        </Route>
    </xsl:template>

</xsl:stylesheet>